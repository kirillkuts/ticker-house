"use server";

import { auth } from "@trigger.dev/sdk";
import { chat } from "@trigger.dev/sdk/ai";
import { saveChat } from "@/lib/chats";

export const startChatSession = chat.createStartSessionAction("ticker-chat");

// Persist a chat snapshot (called from the client after each completed turn).
// No auth exists in this app — chats are scoped by unguessable chat id only.
export async function saveChatAction(chatId: string, title: string, messagesJson: string) {
  await saveChat(chatId, title, messagesJson);
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
