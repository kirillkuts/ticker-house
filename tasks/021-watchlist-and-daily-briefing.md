# 021 — Watchlist + AI daily briefing (high-level plan)

**Status:** done — phase 1 shipped (043/044/045/046); phases 2–6 have their own task
files (047 filings, 048 event detection, 049 briefing agent, 050 recipes, 051 page).

A user builds a watchlist. An agent checks each watched stock daily and writes a briefing
covering prices and SEC filings. v1 sources are prices + EDGAR only (no news APIs). The agent
runs daily but only writes real analysis when something happened (new filing, notable price
move). Quiet days get an honest one-liner, never padded analysis. Delivery is an in-app
briefing page first; email later.

Decisions already made:
- v1 data: prices + SEC filings. News comes later.
- Event-driven writing, daily cadence for the job itself.
- Personalization is two-layer: shared per-stock analysis (one per stock per day, whoever
  watches it), then a cheap per-user assembly pass that applies recipe / custom instructions.
  Instructions shape presentation and emphasis, not the underlying analysis.
- Recipes are readable prompt templates the user can fork; custom instructions are the
  power-user escape hatch.
- Multi-user is real (task 026): Postgres `users`/`sessions` exist, watchlist and briefings
  reference users(id) uuid from day one.
- Storage boundary (already the project convention, see web/lib/db.ts): ClickHouse holds what
  the market did (prices, financials, segments, filings — append-only, analytical). Postgres
  holds what the app and users did: watchlist, stock_briefs, briefings, recipes/settings.
  Never split one feature's state across both. New tables follow the existing pattern —
  plain `pg` + idempotent CREATE TABLE IF NOT EXISTS in ensureSchema, no ORM. No
  cross-database joins anywhere in the pipeline — jobs read from both, join in code.

## Phase 1 — Watchlist + interest tracking (tasks 043/044/045/046) — DONE

Split into three tasks: 043 (pg schema: `watchlist` with soft removes +
`stock_interest_events` with weighted kinds, lib web/lib/watchlist.ts incl. the
`interestRanking` the briefer will call), 044 (chat tools add/remove/show watchlist, thread
userId into the trigger job, implicit `view_rendered`/`chat_question` events from view
tools), 045 (star toggle, Watching section on home, instrument tile clicks / explain
popovers / widget saves as interest events). recipe_key/custom_instructions columns deferred
to phase 5 — the briefer prioritizes watchlist first, then interest score, so it can serve
users who never curate a watchlist.

Decisions that changed during implementation:
- userId threading (044): the browser is never trusted; the authed `startChatSession`
  action claims chat_id → user_id in `chats` before the run boots, and the trigger job's
  tools resolve the owner by chatId (per-turn tools function form).
- `chat_question` is recorded from the first view tool call of each turn — the cheapest
  reliable proxy; chip clicks count as questions.
- 046 (added later) records `overview_view` on every stock open — dashboard loads and
  restored chats — debounced per browser session per ticker via sessionStorage.
- The chat agent caps `maxOutputTokens` at 4096: OpenRouter rejects requests whose
  ceiling exceeds the remaining credit. The briefer (049) inherits both the cap and the
  credits dependency.
- Trigger.dev runs via `trigger.dev dev` locally, so localhost Postgres/ClickHouse work
  in dev; a cloud deploy needs reachable DATABASE_URL/CLICKHOUSE_URL (affects 048/049).

## Phase 2 — Filings ingestion

New sync following the existing pattern (src/lib/sync-filings.ts + src/cli/sync-filings.ts +
`npm run sync:filings`). Source: data.sec.gov submissions JSON per CIK — `sec.ts` already
fetches this file for metadata; the same payload lists recent filings. Store table `filings`:
security_id, cik, accession, form, filed_date, items (8-K item codes), primary_document, url,
ingested_at, version. For 8-K / 10-Q / 10-K also fetch the primary document, strip HTML to
text, snapshot raw under data/raw/, store text for the agent to read. Watched +
universe tickers only. EDGAR politeness rules as everywhere else (UA header, ≤10 req/s).

## Phase 3 — Daily event detection

Scheduled trigger.dev task (cron, once per weekday morning ET). Also schedule the daily price
sync — today prices cover only a fixed two-week window, which breaks "price moved yesterday".
Per watched stock, compute events since the last briefing: new filing rows; daily price move
beyond a threshold (start at |3%|, config constant). No events → status "quiet". Output feeds
Phase 4 directly; no separate events table unless it proves useful.

## Phase 4 — Briefing agent

Trigger.dev task reusing the OpenRouter + AI SDK setup from web/trigger/chat.ts.
Layer 1: per-stock brief, one per (stock, day), stored in Postgres table `stock_briefs`
(unique on security_id + brief_date; also the filing-check watermark via max(brief_date)) —
reads the filing text + price context, writes what changed and why it matters. Grounding rule
like the chat agent: never invent numbers, cite the filing (form + date + link). Quiet days
still write a row (empty events, stub line) so the watermark always advances.
Layer 2: per-user briefing assembly, stored in Postgres table `briefings` — orders and reframes the
stock briefs per the user's recipe / instructions, writes the quiet one-liners.
Cost shape: N watched stocks with events → N layer-1 calls total, 1 layer-2 call per user.

## Phase 5 — Recipes + custom instructions

Three predefined recipes shipped as plain-text prompt templates the user can read and copy:
long-term fundamentals, dividend income, swing trader. Stored recipe_key on the watchlist (or
user settings); custom_instructions textarea overrides/extends. Applied only in layer 2.
UI: recipe picker + instructions editor on the watchlist page.

## Phase 6 — Briefing page

`/briefing` route: today's briefing with a per-stock section list, links to the underlying
filing and the existing price/fundamentals widgets, date switcher for history (same pattern
as canvas history). Email delivery is explicitly out of scope for v1.

## Sequencing

1 and 2 are independent and can go in parallel. 3 needs 2. 4 needs 3. 5 rides with 4.
6 last. Each phase becomes its own numbered task file with a "Done when" before
implementation: 047 (phase 2), 048 (phase 3), 049 (phase 4), 050 (phase 5), 051 (phase 6).

## Open decisions

- Price-move threshold (start |3%| daily; maybe volume-aware later).
- Forms in v1: 10-K, 10-Q, 8-K. Form 4 (insider trades) is a strong v2 candidate.
- Whether layer 1 also runs for unwatched universe tickers (pre-warming) — no for v1.

Done when: each phase has its own task file and this plan reflects any decisions that changed
during implementation.
