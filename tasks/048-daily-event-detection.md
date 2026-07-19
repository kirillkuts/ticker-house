# 048 — Daily event detection + daily price sync (021 phase 3)

**Status:** done

Depends on 047 (filings table). Two halves: keep the data fresh daily, and compute
per-stock events that feed the briefing agent (049).

## Daily syncs

The price data currently covers a fixed two-week window, which breaks "price moved
yesterday". Schedule the existing price sync and the new filings sync to run daily on
weekday mornings ET, before event detection. Options: a trigger.dev scheduled task that
shells the sync code, or reuse src/lib sync functions directly from a trigger task —
pick whichever avoids duplicating sync logic. The syncs run on the machine that has
ClickHouse access (dev: `trigger.dev dev` runs locally, so localhost works; a cloud
deploy needs reachable CLICKHOUSE_URL/DATABASE_URL — same constraint as noted in 044).

## Event detection

Per stock on any user's watchlist, compute events since the last brief (watermark:
max(brief_date) from stock_briefs once 049 lands; until then, since yesterday):
- new rows in `filings` (form, filed_date, url, items)
- daily close-to-close move beyond a threshold — start at |3%|, a named config constant
  (sanePriceRows-style symbol hygiene applies; see lib/views.ts)

No events → status "quiet". Output is an in-memory structure handed to phase 4; no
separate events table unless it proves useful.

## Done when

The scheduled task runs on the dev machine and logs, per watched stock, either its
events (filing rows and/or price move with numbers) or "quiet". A stock with a fresh
filing in ClickHouse shows a filing event; a stock that moved >3% yesterday shows a
price event; everything else is quiet. Price data for watched stocks extends past the
old two-week window after one scheduled run.
