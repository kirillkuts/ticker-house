# 030 — Sort options for homepage "Covered companies" grid

## Task

The "Covered companies" card grid on the home page currently orders by two-week price change (biggest gainers first). Add a sort control near the section header:

- **A–Z** (by ticker) — the new default.
- **Top revenue** — highest trailing-twelve-month revenue first.

## Notes

- Keep the existing "last two weeks · tap one for the full picture" hint; the sort control sits in the same header row.
- Top revenue needs TTM revenue per company, same source the overview widget uses.
- Sort choice can persist (localStorage is fine) so it survives reloads.
- Related: task 001 (homepage company cards).

## Status
**Status:** done

Resolution: HomeTicker carries revenueTtm (last 4 quarterly revenues summed per
security, queried directly — runMetricQuery caps at 50 rows, fewer than the grown
~100-company universe). The grid header gains an A–Z / Top revenue toggle; A–Z (by
ticker) is the default and the server now pre-sorts alphabetically instead of by
two-week change. Choice persists in localStorage (useSyncExternalStore, no
hydration mismatch). Verified with Playwright (web/scripts/verify-030-ui.mjs):
default is alphabetical, Top revenue reorders to AMZN/WMT/AAPL/UNH/GOOGL…,
persists across reload, A–Z restores. The hint text stays in the header row.
