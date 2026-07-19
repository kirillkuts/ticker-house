# 049 — Briefing agent: per-stock briefs + per-user assembly (021 phase 4)

**Status:** planned

Depends on 048. Trigger.dev task reusing the OpenRouter + AI SDK setup from
web/trigger/chat.ts (same maxOutputTokens cap — see the 044 commit; the OpenRouter
account must have credit or every brief fails like the chat did).

## Layer 1 — shared per-stock brief

One per (stock, day), whoever watches it. Postgres table `stock_briefs` (app data):
id, security_id, symbol, brief_date, status ('events' | 'quiet'), events jsonb,
body text, created_at; UNIQUE (symbol, brief_date). max(brief_date) doubles as the
event-detection watermark, so quiet days still write a row (empty events, one stub
line) — the watermark must always advance.

Input per stock with events: the 048 event list, the filing text from ClickHouse
`filings`, recent price context. Grounding rule as in the chat agent: never invent
numbers; cite the filing (form + date + link) for every claim sourced from it.

## Layer 2 — per-user briefing

Postgres table `briefings`: id, user_id, briefing_date, body text (or jsonb sections),
created_at; UNIQUE (user_id, briefing_date). Assembles that user's watched stocks'
layer-1 briefs: orders by watchlist-first-then-interest (`interestRanking` from
web/lib/watchlist.ts), reframes per recipe/custom instructions (plain assembly until
050 lands), writes honest one-liners for quiet stocks — never padded analysis.

Cost shape: N watched-with-events stocks → N layer-1 calls total across all users,
plus 1 layer-2 call per user with a non-empty watchlist.

## Done when

Running the task on a day with a real filing produces a stock_briefs row whose body
cites the filing form/date/url with no invented numbers, and a briefings row per
watching user that leads with watchlisted stocks. Quiet stocks get one-liners; a fully
quiet day still writes rows (watermark advances). Re-running the same day is idempotent
(unique constraints hold, no duplicate LLM spend).
