"use server";

import { redirect } from "next/navigation";
import { generateObject } from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { auth } from "@trigger.dev/sdk";
import { chat } from "@trigger.dev/sdk/ai";
import { saveChat, recentChats } from "@/lib/chats";
import { companyOverview } from "@/lib/views";
import { saveDashboardWidget, removeDashboardWidget } from "@/lib/dashboard";
import { createUser, verifyUser, startSession, endSession, requireUser } from "@/lib/auth";

export const startChatSession = chat.createStartSessionAction("ticker-chat");

// --- auth -------------------------------------------------------------------

// One form for both modes; a hidden "mode" field says which button submitted.
export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const mode = String(formData.get("mode") ?? "login");

  if (mode === "signup") {
    const created = await createUser(email, password);
    if ("error" in created) redirect(`/login?mode=signup&error=${encodeURIComponent(created.error)}`);
    await startSession(created.id);
  } else {
    const user = await verifyUser(email, password);
    if (!user) redirect(`/login?error=${encodeURIComponent("Wrong email or password.")}`);
    await startSession(user.id);
  }
  redirect("/");
}

export async function signOutAction() {
  await endSession();
  redirect("/login");
}

// --- per-user data ----------------------------------------------------------

// Persist a chat snapshot (called from the client after each completed turn).
export async function saveChatAction(chatId: string, title: string, messagesJson: string) {
  const user = await requireUser();
  await saveChat(user.id, chatId, title, messagesJson);
}

// Fresh recent-chats list for the header dropdown (fetched on open).
export async function listRecentChats() {
  const user = await requireUser();
  return recentChats(user.id, 12);
}

// Direct company-overview fetch for the home tiles: the question and the
// tool call are known in advance, so the client skips the agent roundtrip.
export async function fetchCompanyOverview(ticker: string) {
  return companyOverview(ticker);
}

// Save a widget recipe (tool + input) to the live dashboard / remove one.
export async function saveDashboardWidgetAction(widgetId: string, tool: string, inputJson: string) {
  const user = await requireUser();
  await saveDashboardWidget(user.id, widgetId, tool, inputJson);
}

export async function removeDashboardWidgetAction(widgetId: string) {
  const user = await requireUser();
  await removeDashboardWidget(user.id, widgetId);
}

// Cmd+click "what is this?" (task 032): a one-off explanation shown in a
// popover beside the clicked element — never posted into the chat thread, so
// it skips the chat session entirely and calls the fast model directly.
// Suggestions (task 038) become clickable chips under the answer; each must
// be a question the chat's view tools can answer with a widget.
export interface ExplainResult {
  text: string;
  suggestions: { label: string; prompt: string }[];
}

export async function explainElementAction(question: string): Promise<ExplainResult | { error: string }> {
  await requireUser();
  try {
    const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_KEY });
    const { object } = await generateObject({
      model: openrouter("anthropic/claude-haiku-4.5"),
      schema: z.object({
        answer: z
          .string()
          .describe(
            "The explanation, markdown. At most 3 bullet points ('- ') of one short sentence each — or 2 plain sentences — under 60 words total. Bold the defined term and the key number with **markdown**. No intro, no filler, no headers.",
          ),
        // No .max() constraints: OpenRouter's Azure-hosted Claude rejects
        // maxItems/maxLength in structured-output schemas — clamped in code.
        suggestions: z
          .array(z.object({
            label: z.string().describe("Short chip label under 32 chars, e.g. 'Fastest segment?'"),
            prompt: z.string().describe("The full question to ask, naming concrete tickers/metrics so a dashboard view can answer it"),
          }))
          .describe("1-2 natural next questions about this element. Almost always provide at least one; return none only when truly nothing follows."),
      }),
      system:
        "You are TickerHouse's explain-on-click helper. The user cmd+clicked an element of a rendered stock dashboard; the question carries the element's kind, its section, and its visible text. Explain it in plain language for a non-expert. Ground yourself ONLY in the provided context — never invent numbers. Also suggest 1-2 follow-up questions a stock dashboard could answer with a chart or table — name the concrete tickers and metrics from the context (compare vs peers, show the trend over 5 years, rank a group). Suggest at least one whenever the element involves a company, metric or segment; return none only when truly nothing follows.",
      prompt: question.slice(0, 4000),
    });
    return {
      text: object.answer,
      suggestions: (object.suggestions ?? []).slice(0, 2).map((s) => ({ ...s, label: s.label.slice(0, 32) })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 200) : "Explanation failed" };
  }
}

export async function mintChatAccessToken(chatId: string) {
  await requireUser();
  return auth.createPublicToken({
    scopes: {
      read: { sessions: chatId },
      write: { sessions: chatId },
    },
    expirationTime: "1h",
  });
}
