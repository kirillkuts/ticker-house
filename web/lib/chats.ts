import { db, ensureSchema } from "./db";
import type { ChatUIMessage } from "@/trigger/chat";

// Chat history lives in Postgres, one row per chat, scoped to its owner.
// Each save stores the full UIMessage[] snapshot (including tool outputs), so
// restoring a chat restores its widgets without re-running any queries.

export async function saveChat(userId: string, chatId: string, title: string, messagesJson: string): Promise<void> {
  await ensureSchema();
  // The WHERE on the upsert makes ownership sticky: a colliding chat_id from
  // another user updates nothing instead of stealing the chat.
  await db().query(
    `INSERT INTO chats (chat_id, user_id, title, messages, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (chat_id) DO UPDATE
       SET title = EXCLUDED.title, messages = EXCLUDED.messages, updated_at = now()
       WHERE chats.user_id = EXCLUDED.user_id`,
    [chatId, userId, title, messagesJson],
  );
}

// Called from the authed startChatSession action, BEFORE the agent run boots:
// pins chat_id → user_id so the trigger job's tools can resolve the user from
// the chatId without trusting anything browser-supplied. The placeholder row
// is invisible in recents (empty messages) and overwritten by the first save.
export async function claimChat(userId: string, chatId: string): Promise<void> {
  await ensureSchema();
  await db().query(
    `INSERT INTO chats (chat_id, user_id, title, messages) VALUES ($1, $2, '', '[]')
     ON CONFLICT (chat_id) DO NOTHING`,
    [chatId, userId],
  );
}

export async function chatOwner(chatId: string): Promise<string | null> {
  await ensureSchema();
  const res = await db().query<{ user_id: string }>(
    `SELECT user_id FROM chats WHERE chat_id = $1`,
    [chatId],
  );
  return res.rows[0]?.user_id ?? null;
}

export interface StoredChat {
  chatId: string;
  title: string;
  messages: ChatUIMessage[];
}

export async function loadChat(userId: string, chatId: string): Promise<StoredChat | null> {
  await ensureSchema();
  const res = await db().query<{ chat_id: string; title: string; messages: string }>(
    `SELECT chat_id, title, messages FROM chats WHERE chat_id = $1 AND user_id = $2`,
    [chatId, userId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    chatId: row.chat_id,
    title: row.title,
    messages: JSON.parse(row.messages) as ChatUIMessage[],
  };
}

export interface RecentChat {
  chatId: string;
  title: string;
  updatedAt: string;
}

export async function recentChats(userId: string, limit = 8): Promise<RecentChat[]> {
  await ensureSchema();
  const res = await db().query<RecentChat>(
    `SELECT chat_id AS "chatId", title, to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS "updatedAt"
     FROM chats
     WHERE user_id = $1 AND messages <> '[]'
     ORDER BY updated_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return res.rows;
}
