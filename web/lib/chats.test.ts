import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, ensureSchema } from "./db";
import { claimChat, chatOwner, userOwnsChat } from "./chats";

// Two-user authorization test for chat ownership (security fix): a chat claimed
// by one account must never be claimable, re-ownable, or token-mintable by
// another. Runs against a live Postgres — the repo docker-compose one locally,
// or the `postgres` service in CI (DATABASE_URL points at either). Rows are
// created with unique ids and cleaned up in `after`, so it is safe to run
// against a shared database.

let userA = "";
let userB = "";
const chatId = `test-chat-${randomUUID()}`;
const emailA = `test-a-${randomUUID()}@example.test`;
const emailB = `test-b-${randomUUID()}@example.test`;

before(async () => {
  await ensureSchema();
  const a = await db().query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
    [emailA],
  );
  const b = await db().query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
    [emailB],
  );
  userA = a.rows[0].id;
  userB = b.rows[0].id;
});

after(async () => {
  await db().query(`DELETE FROM chats WHERE chat_id = $1`, [chatId]);
  await db().query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userA, userB]]);
  await db().end();
});

// The tests below share state and run in declaration order (node:test runs
// top-level tests sequentially): A claims the chat, then B is refused.

test("user A's first claim succeeds and pins ownership", async () => {
  assert.equal(await claimChat(userA, chatId), true);
  assert.equal(await chatOwner(chatId), userA);
});

test("user B cannot claim a chat already owned by user A", async () => {
  assert.equal(await claimChat(userB, chatId), false);
  // Ownership is unchanged — the collision did not steal or reassign the chat.
  assert.equal(await chatOwner(chatId), userA);
});

test("the owner re-claiming their own chat still succeeds (idempotent)", async () => {
  assert.equal(await claimChat(userA, chatId), true);
  assert.equal(await chatOwner(chatId), userA);
});

test("token-mint gate allows the owner and refuses another user", async () => {
  assert.equal(await userOwnsChat(userA, chatId), true);
  assert.equal(await userOwnsChat(userB, chatId), false);
  // An unclaimed chat has no owner bound yet, so the gate does not block it.
  assert.equal(await userOwnsChat(userB, `unclaimed-${randomUUID()}`), true);
});
