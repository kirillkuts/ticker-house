# 002 — Per-chat URLs and stored history

**Status:** done

Resolution: chats persist in ClickHouse (`chats` table, ReplacingMergeTree by chat_id, full UIMessage[] snapshot saved via server action after each completed turn — tool outputs included, so widgets restore without refetching). New route `app/chat/[id]/page.tsx` loads the snapshot into useChat's initial messages. A fresh chat mints a UUID and swaps the URL to `/chat/<id>` with history.replaceState (no remount). Home screen lists recent chats with relative timestamps; "+ New chat" still goes to `/`. Unknown ids act as a fresh chat at that URL. Verified live: seeded chat restored at its URL, listed on home, unknown id falls back to home screen, typecheck passes. Known limitation: reloading mid-answer doesn't resume the stream (next turn still lands in the same Trigger session).

From user screenshot: a conversation lives at `localhost:3000` with no chat id in the URL. Reloading loses everything, chats can't be shared or revisited.

Wanted:
- Each chat gets its own URL, e.g. `/chat/<id>`. Starting a chat from the home screen creates an id and navigates there (URL update without full reload where possible).
- Chat history is persisted (messages, tool parts/view data) so reopening the URL restores the full conversation with rendered widgets.
- A way to get back to past chats (at minimum: recent-chats list on the home screen or in the header; "+ New chat" goes to `/`).

Implementation notes:
- App is Next.js App Router + `useChat` with a Trigger.dev transport (web/components/Chat.tsx, web/trigger/chat.ts). Check node_modules/next/dist/docs/ per AGENTS.md before writing routes.
- Storage: pick the simplest durable option available in this stack (ClickHouse table, or a lightweight sqlite/file store) — decide when implementing; no auth exists, so scope by chat id only.
- Persist messages after each completed assistant turn; restore into useChat initial messages on load.

Done when: refreshing a chat URL restores the conversation, a new chat mints a new URL, and old chats are reachable from a list.
