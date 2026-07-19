"use server";

import { redirect } from "next/navigation";
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
