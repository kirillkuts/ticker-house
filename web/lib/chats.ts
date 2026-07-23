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
//
// Returns true only when the caller now owns the chat: either the row was
// newly inserted, or it already existed and belongs to this user. Returns
// false when the chatId already belongs to someone else. This is a single
// atomic statement so a colliding chat_id can never be silently accepted:
// the insert-or-get CTE yields the row's real owner in every case (a fresh
// insert returns userId; a conflict returns the existing owner), and the
// caller compares. Without this, a claim collision no-oped and the agent
// still booted, resolving — and acting as — the original owner.
export async function claimChat(userId: string, chatId: string): Promise<boolean> {
  await ensureSchema();
  const res = await db().query<{ user_id: string }>(
    `WITH ins AS (
       INSERT INTO chats (chat_id, user_id, title, messages) VALUES ($1, $2, '', '[]')
       ON CONFLICT (chat_id) DO NOTHING
       RETURNING user_id
     )
     SELECT user_id FROM ins
     UNION ALL
     SELECT user_id FROM chats WHERE chat_id = $1
     LIMIT 1`,
    [chatId, userId],
  );
  return res.rows[0]?.user_id === userId;
}

export async function chatOwner(chatId: string): Promise<string | null> {
  await ensureSchema();
  const res = await db().query<{ user_id: string }>(
    `SELECT user_id FROM chats WHERE chat_id = $1`,
    [chatId],
  );
  return res.rows[0]?.user_id ?? null;
}

// Read-only ownership gate, shared by token minting: true when the chat is
// unclaimed (no owner bound yet) or already owned by this user, false when it
// belongs to someone else. Mirrors claimChat's success condition without
// writing a row — a mint must never hand a foreign chat's session token out.
export async function userOwnsChat(userId: string, chatId: string): Promise<boolean> {
  const owner = await chatOwner(chatId);
  return owner === null || owner === userId;
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
