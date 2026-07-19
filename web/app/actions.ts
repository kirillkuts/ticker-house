"use server";

import { auth } from "@trigger.dev/sdk";
import { chat } from "@trigger.dev/sdk/ai";
import { saveChat, recentChats } from "@/lib/chats";
import { companyOverview } from "@/lib/views";
import { saveDashboardWidget, removeDashboardWidget } from "@/lib/dashboard";

export const startChatSession = chat.createStartSessionAction("ticker-chat");

// Persist a chat snapshot (called from the client after each completed turn).
// No auth exists in this app — chats are scoped by unguessable chat id only.
export async function saveChatAction(chatId: string, title: string, messagesJson: string) {
  await saveChat(chatId, title, messagesJson);
}

// Fresh recent-chats list for the header dropdown (fetched on open).
export async function listRecentChats() {
  return recentChats(12);
}

// Direct company-overview fetch for the home tiles: the question and the
// tool call are known in advance, so the client skips the agent roundtrip.
export async function fetchCompanyOverview(ticker: string) {
  return companyOverview(ticker);
}

// Save a widget recipe (tool + input) to the live dashboard / remove one.
export async function saveDashboardWidgetAction(widgetId: string, tool: string, inputJson: string) {
  await saveDashboardWidget(widgetId, tool, inputJson);
}

export async function removeDashboardWidgetAction(widgetId: string) {
  await removeDashboardWidget(widgetId);
}

export async function mintChatAccessToken(chatId: string) {
  return auth.createPublicToken({
    scopes: {
      read: { sessions: chatId },
      write: { sessions: chatId },
    },
    expirationTime: "1h",
  });
}
