# 043 — PG: watchlist + stock interest tracking

**Status:** done

Part 1 of 3 (043 PG, 044 tools, 045 UI) for task 021's watchlist foundation. Store two kinds
of signal in Postgres so the future briefer (021 phase 4) can prioritize: explicit watchlist
membership, and implicit interest events (the user asked about a stock, viewed it, saved a
widget of it). Watchlist entries outrank interest; interest ranks everything else.

## Schema (add to ensureSchema in web/lib/db.ts, same idempotent pattern)

```sql
CREATE TABLE IF NOT EXISTS watchlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  security_id integer,                -- nullable: uncovered tickers have prices only
  symbol      text NOT NULL,          -- uppercase ticker as the user knows it
  added_at    timestamptz NOT NULL DEFAULT now(),
  removed_at  timestamptz             -- soft remove: history of adds/removes is the point
);
CREATE UNIQUE INDEX IF NOT EXISTS watchlist_active_unique
  ON watchlist (user_id, symbol) WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS stock_interest_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol      text NOT NULL,
  kind        text NOT NULL,          -- see kinds below
  weight      smallint NOT NULL,      -- signed; stamped from kind at insert time
  context     jsonb,                  -- e.g. {chat_id, tool, question} — no fixed shape
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS interest_user_symbol ON stock_interest_events (user_id, symbol);
CREATE INDEX IF NOT EXISTS interest_user_recent ON stock_interest_events (user_id, created_at DESC);
```

Event kinds and default weights (constants in code, stamped into `weight` at insert so
re-tuning weights later doesn't rewrite history):
- `chat_question` +3 — user typed a question about the ticker (strongest signal per the
  session-summarizer weighting from task 039)
- `explain_click` +2 — cmd+click "what is this" on an element of this stock
- `view_rendered` +1 — a view tool rendered this stock in chat
- `overview_view` +1 — opened the company overview from a tile
- `widget_saved` +3 / `widget_removed` -3 — dashboard save/remove
- `watchlist_add` +5 / `watchlist_remove` -5 — logged here too, so one table replays the
  full interest history

## Data-access layer: web/lib/watchlist.ts

- `addToWatchlist(userId, symbol)` / `removeFromWatchlist(userId, symbol)` — upsert against
  the partial unique index (re-add after remove inserts a fresh row); each also records the
  corresponding interest event.
- `getWatchlist(userId)` — active rows, newest first.
- `recordInterest(userId, symbol, kind, context?)` — fire-and-forget insert; never throw
  into the caller (interest logging must not break a chat turn or page render).
- `interestRanking(userId, {days = 30})` — one query: sum of weight × exponential recency
  decay (half-life ~7 days) grouped by symbol, watchlist symbols pinned to the top
  regardless of score. This is the function the briefer will call.

Symbols are the join key across both tables (uppercase, as typed); resolve security_id
best-effort from ClickHouse `securities` at write time but never block on it — the FB/Meta
symbol-history trap (see memory) means resolution can be wrong for exotic tickers, and the
briefer can re-resolve later.

## Done when

Tables exist via ensureSchema on a fresh DB and on the existing DB. Unit-level check:
add → remove → re-add yields one active row and three interest events;
`interestRanking` puts a watchlisted stock above a higher-scoring non-watchlisted one;
`recordInterest` with a failing pool logs but does not throw.
