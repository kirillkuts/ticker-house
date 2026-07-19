// DB-level verification for task 026: users, password auth, per-user scoping.
import { createUser, verifyUser } from "../lib/auth";
import { saveChat, loadChat, recentChats } from "../lib/chats";
import { saveDashboardWidget, listDashboardWidgets, removeDashboardWidget } from "../lib/dashboard";
import { db } from "../lib/db";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok: ${msg}`);
}

async function main() {
const stamp = Date.now();
  const emailA = `alice-${stamp}@test.dev`;
  const emailB = `bob-${stamp}@test.dev`;
  
  const a = await createUser(emailA, "password123");
  assert(!("error" in a), "create user A");
  const b = await createUser(emailB, "password456");
  assert(!("error" in b), "create user B");
  const dupe = await createUser(emailA, "password123");
  assert("error" in dupe, "duplicate email rejected");
  const short = await createUser(`c-${stamp}@test.dev`, "short");
  assert("error" in short, "short password rejected");
  
  const userA = a as { id: string };
  const userB = b as { id: string };
  
  assert(await verifyUser(emailA, "password123"), "login A with right password");
  assert(!(await verifyUser(emailA, "wrongpass")), "login A with wrong password rejected");
  
  const chatId = `chat-${stamp}`;
  await saveChat(userA.id, chatId, "AAPL chat", JSON.stringify([{ id: "m1", role: "user", parts: [] }]));
  assert((await loadChat(userA.id, chatId))?.title === "AAPL chat", "owner loads own chat");
  assert((await loadChat(userB.id, chatId)) === null, "other user cannot load the chat");
  
  // Upsert by another user must not steal ownership.
  await saveChat(userB.id, chatId, "stolen", "[]");
  const still = await loadChat(userA.id, chatId);
  assert(still?.title === "AAPL chat", "cross-user upsert did not overwrite");
  
  await saveChat(userA.id, chatId, "AAPL chat v2", "[]");
  assert((await loadChat(userA.id, chatId))?.title === "AAPL chat v2", "owner upsert updates");
  
  const recentA = await recentChats(userA.id);
  const recentB = await recentChats(userB.id);
  assert(recentA.some((c) => c.chatId === chatId), "chat in A's recents");
  assert(!recentB.some((c) => c.chatId === chatId), "chat not in B's recents");
  
  const widgetId = `w-${stamp}`;
  await saveDashboardWidget(userA.id, widgetId, "show_price_chart", JSON.stringify({ ticker: "AAPL", range: "1m" }));
  assert((await listDashboardWidgets(userA.id)).some((w) => w.widgetId === widgetId), "widget in A's dashboard");
  assert(!(await listDashboardWidgets(userB.id)).some((w) => w.widgetId === widgetId), "widget not in B's dashboard");
  await removeDashboardWidget(userB.id, widgetId);
  assert((await listDashboardWidgets(userA.id)).some((w) => w.widgetId === widgetId), "B cannot remove A's widget");
  await removeDashboardWidget(userA.id, widgetId);
  assert(!(await listDashboardWidgets(userA.id)).some((w) => w.widgetId === widgetId), "A removed own widget");
  
  // Cleanup test rows.
  await db().query(`DELETE FROM users WHERE email IN ($1, $2)`, [emailA, emailB]);
  console.log("ALL PASS");
  process.exit(0);
  
}
main().catch((e) => { console.error(e); process.exit(1); });
