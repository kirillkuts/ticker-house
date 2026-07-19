# 044 — Chat tools: watchlist add/remove + implicit interest recording

**Status:** done

Part 2 of 3 (043 PG, 044 tools, 045 UI). Depends on 043. Two halves: (a) the user can manage
the watchlist by talking to the chat agent, (b) every single-stock view the agent renders
silently records an interest event, so the briefer learns what the user cares about without
them ever touching the watchlist.

## Prerequisite: the job must know the user

`tickerChat` (web/trigger/chat.ts) currently receives only `{ speed }` in clientData — no
user identity. Thread `userId` from the authed server action (`startChatSession` in
web/app/actions.ts reads the session) into the chat agent server-side. Do NOT accept userId
from browser-supplied clientData — the browser could claim any uuid. If the trigger.dev
session API only forwards client data, sign or look up: store chat_id → user_id at session
start (the `chats` table already has both columns) and have tools resolve the user from
chat_id. Pick whichever is less code; both are trusted paths.

Also confirm the trigger job's runtime can reach Postgres (DATABASE_URL in the trigger
environment). If jobs run in trigger.dev cloud against localhost pg, tools that write will
fail — surface this early, it changes deployment, not code.

## New tools (web/trigger/chat.ts)

- `add_to_watchlist { ticker }` / `remove_from_watchlist { ticker }` — call the 043 lib,
  return `{ ok, watching: [...] }` so the model can confirm in one short sentence. The UI
  half (045) may render a small confirmation chip from the tool part; text confirmation is
  enough for this task.
- `show_watchlist {}` — returns active watchlist with last close per symbol (reuse the
  price lookup from views.ts, `sanePriceRows` included). Plain list result; a dedicated
  widget is 045's call.

System prompt additions: when the user says "watch X", "add X to my watchlist", "stop
watching X", call the tool — never claim to have added something without calling it. When
asked "what am I watching", use show_watchlist.

## Implicit interest recording

In the execute path of each single-ticker view tool — show_company_overview,
show_price_chart, show_fundamentals, show_expense_breakdown, show_segments — record
`view_rendered` for that ticker via `recordInterest` (fire-and-forget, never blocks or
fails the tool). Additionally record `chat_question` once per user turn for tickers the
model was explicitly asked about: cheapest reliable source is the first view tool call of
the turn (chip-click turns arrive with speed:fast metadata and count too — a click is a
question). Skip query_metrics: multi-stock screens are not single-stock interest.

`context` gets `{ chat_id, tool }`. No interest recording when userId is unresolvable
(anonymous/dev sessions): skip silently.

## Done when

In a real chat: "add NVDA to my watchlist" creates an active watchlist row + watchlist_add
event; "what am I watching" lists it; "tell me about AMZN" leaves view_rendered +
chat_question events for AMZN and no watchlist row; all writes carry the logged-in user's
uuid, verified in pg. A chat with tools failing to reach pg still answers normally (interest
loss is silent, watchlist tools report the error honestly).
