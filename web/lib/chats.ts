import { chClient } from "./clickhouse";
import type { ChatUIMessage } from "@/trigger/chat";

// Chat history lives in ClickHouse next to the market data: one row per save,
// ReplacingMergeTree keeps the newest snapshot per chat_id. Each snapshot is
// the full UIMessage[] (including tool outputs), so restoring a chat restores
// its widgets without re-running any queries.

let ensured: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  ensured ??= (async () => {
    const ch = chClient();
    try {
      await ch.command({
        query: `
CREATE TABLE IF NOT EXISTS chats
(
    chat_id String,
    title String,
    messages String,
    updated_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY chat_id`,
      });
    } finally {
      await ch.close();
    }
  })();
  return ensured;
}

export async function saveChat(chatId: string, title: string, messagesJson: string): Promise<void> {
  await ensureTable();
  const ch = chClient();
  try {
    await ch.insert({
      table: "chats",
      values: [{ chat_id: chatId, title, messages: messagesJson }],
      format: "JSONEachRow",
    });
  } finally {
    await ch.close();
  }
}

export interface StoredChat {
  chatId: string;
  title: string;
  messages: ChatUIMessage[];
}

export async function loadChat(chatId: string): Promise<StoredChat | null> {
  await ensureTable();
  const ch = chClient();
  try {
    const rs = await ch.query({
      query: `SELECT chat_id AS chatId, title, messages
              FROM chats FINAL
              WHERE chat_id = {id:String}
              LIMIT 1`,
      query_params: { id: chatId },
      format: "JSONEachRow",
    });
    const rows = await rs.json<{ chatId: string; title: string; messages: string }>();
    if (rows.length === 0) return null;
    return {
      chatId: rows[0].chatId,
      title: rows[0].title,
      messages: JSON.parse(rows[0].messages) as ChatUIMessage[],
    };
  } finally {
    await ch.close();
  }
}

export interface RecentChat {
  chatId: string;
  title: string;
  updatedAt: string;
}

export async function recentChats(limit = 8): Promise<RecentChat[]> {
  await ensureTable();
  const ch = chClient();
  try {
    const rs = await ch.query({
      query: `SELECT chat_id AS chatId, title, toString(updated_at) AS updatedAt
              FROM chats FINAL
              ORDER BY updated_at DESC
              LIMIT {lim:UInt32}`,
      query_params: { lim: limit },
      format: "JSONEachRow",
    });
    return await rs.json<RecentChat>();
  } finally {
    await ch.close();
  }
}
