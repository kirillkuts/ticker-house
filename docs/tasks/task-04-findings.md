# Task 4 findings — Normalize and ingest daily prices

One function, `syncDailyPrices(from, to)`, runnable via `npm run sync:prices -- --from 2026-06-01 --to 2026-07-16`. With no arguments it ingests the last completed trading day. Backfill and nightly update are the same code path over different date ranges.

```text
for each calendar date in range:
    grouped-daily call (whole market, one request)
    → resolve tickers to security_id via securities
    → normalize rows
fetch splits and dividends for the range (no ticker filter, cursor-paginated)
    → stamp split_factor / dividend_adjustment onto matching (security_id, date) rows
insert in batches of ≤100k rows, single version per run
recompute adjusted_close for affected securities (ClickHouse pass)
quality checks
```

## Source-field → column mapping

| Column | Source | Rule |
|---|---|---|
| security_id | internal | resolved from `T`, see below |
| trade_date | request | the date the grouped-daily call was made for (`t` epoch-ms confirms it; dates are US Eastern trading days) |
| open, high, low, close | grouped daily | `o/h/l/c` verbatim, unadjusted (`adjusted=false`) |
| adjusted_close | computed | split-adjusted close, see below |
| volume | grouped daily | `v` rounded to integer (arrives as float) |
| transaction_count | grouped daily | `n`, null when absent |
| vwap | grouped daily | `vw`, null when absent |
| split_factor | splits endpoint | `split_to / split_from` on `execution_date`, else 1 |
| dividend_adjustment | dividends endpoint | `historical_adjustment_factor` on `ex_dividend_date`, else 1 |
| source_symbol | grouped daily | `T` verbatim (dot notation, e.g. `BRK.B`) |
| source | constant | `massive` |
| version | internal | run start epoch ms, same for all rows of a run |

## Symbol resolution

Massive uses dot share-class notation (`BRK.B`); `securities` stores dashes (`BRK-B`). Resolution for a row on `trade_date`:

1. Convert `T` dots to dashes.
2. Look up the ticker among active `securities` rows: first as a current `ticker`, then inside `symbol_history` where `valid_from <= trade_date < valid_to` (null `valid_to` = open interval).
3. No hit → the row is skipped and counted. Grouped daily returns ~12.4k tickers; the SEC file has ~10.4k, so roughly 2k skips per day (warrants, units, OTC listings) are expected and only reported as one count, not per-row warnings.

The resolution map is built once per run from ClickHouse, not per row.

## Splits, dividends, adjusted close

Both event endpoints are queried for the run's date range without a ticker filter (`execution_date.gte=<from>&execution_date.lte=<to>`, same for `ex_dividend_date`), cursor-paginated at `limit=1000`. Two requests plus pagination cover every security, instead of two requests per ticker.

- `split_factor` = `split_to / split_from` stored on the execution date's price row (4.0 for AAPL's 2020 4:1 split). Default 1.
- `dividend_adjustment` = the event's `historical_adjustment_factor` stored on the ex-dividend date's row. Default 1. Stored for future total-return math; not used in v1's adjusted close.

**adjusted_close = split-adjusted close only (v1 decision).** Dividend-adjusted ("total return") prices change every historical value on every dividend, which forces mass rewrites four times a year per payer. Split-adjusted close is what price charts normally show. The rule:

```text
adjusted_close(d) = close(d) / product of split_factor over rows with trade_date > d
```

Computed inside ClickHouse after insert, per affected security:

```sql
SELECT ..., close / exp(sum(log(split_factor)) OVER (
    PARTITION BY security_id ORDER BY trade_date DESC
    ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)) AS adjusted_close
```

Rows whose adjusted_close changed are re-inserted with the run's version. For securities with no splits in history (almost all), adjusted_close = close and no recompute pass is needed; the pass runs only for securities that had a split event in the ingested range.

Backfill ordering note: because adjustment looks at *later* rows, backfilling older history after newer history triggers a recompute for split securities. The pass is idempotent, so this is just extra writes, not corruption.

## Missing data and edge cases

- Non-trading days (weekends, holidays): grouped daily returns `resultsCount: 0`; the day is skipped silently.
- Unresolved symbols: skipped, one summary count in the report.
- Missing `vw`/`n`: stored as NULL.
- Split/dividend event for a ticker with no price row that day (delisted, halted): counted as a warning.
- A `queryCount: 0` response for a weekday is reported as a warning (data not yet published — grouped daily for day D is available the evening of D).

## Replay-safe insert

Identical policy to securities: insert-only, `ReplacingMergeTree(version)` with version = run epoch ms. Re-running a date range simply supersedes rows with identical data. Batches of up to 100k rows (4 months of full-market days) per insert call. Raw grouped-daily responses land in `data/raw/<run-date>/prices_<trade-date>.json` for replay.

## Rate-limit budget

One grouped-daily call per trading day + 2 event queries per run. At 5 calls/min: one year of backfill ≈ 252 calls ≈ 51 minutes. Nightly update = 3 calls.

## Data-quality checks

1. No duplicate `(security_id, trade_date)` pairs.
2. OHLC sanity on inserted rows: `low <= open, close, high` and `high >= low`; violations counted (bad provider ticks happen; they're flagged, not dropped).
3. Universe coverage: every enriched-universe ticker has a row for every trading day in the range.
4. Day-count sanity: each trading day inserted at least 5,000 resolved rows (guards against truncated responses).

## Verified run (2026-07-17)

`npm run sync:prices -- --from 2026-07-01 --to 2026-07-16`:

- 11 trading days ingested, 73,091 rows; July 3 (holiday) correctly reported as a no-data weekday.
- 41 splits and 483 dividends stamped onto price rows; 449 securities' adjusted_close recomputed.
- Split math spot-checked on CRWD's 4:1 split (2026-07-02): pre-split close 772.74 → adjusted_close 193.185, post-split rows unchanged.
- ~5,800 unresolved symbols per day (grouped daily includes OTC and instruments outside the SEC exchange-listed file) — higher than the ~2k estimate, expected and harmless.
- "split ... no price row in range" warnings are thinly traded OTC names with no trade that day.
- All quality checks passed; re-runs supersede rows idempotently.

## Code layout

```text
src/
  lib/
    prices.ts             # grouped daily, splits, dividends fetchers
    sync-daily-prices.ts  # orchestration, resolution, adjusted-close pass
  cli/sync-prices.ts      # npm run sync:prices -- --from ... --to ...
```
