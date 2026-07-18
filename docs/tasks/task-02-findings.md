# Task 2 findings — Normalize and ingest securities

Orchestration: a Trigger.dev scheduled task calls one plain TypeScript function, `syncSecurities()`. The function is also runnable from the CLI (`npm run sync:securities`), so ingestion doesn't depend on Trigger.dev being up.

```text
Trigger.dev scheduled task (weekly) or CLI
    → fetch SEC ticker file + SEC submissions + Massive details/events
    → save raw snapshots to data/raw/<date>/
    → normalize into canonical security records
    → load current ClickHouse securities (FINAL)
    → reconcile identities, allocate security_id, build symbol_history
    → insert changed rows as one batch with a new version
    → report counts and validation failures
```

## Universe

Two tiers, because Massive's free tier is 5 requests per minute:

- **Base tier**: every row in the SEC ticker file (~10k). SEC-only fields, one bulk file, cheap.
- **Enriched tier**: tickers listed in `data/universe.txt` (start small, grow to S&P 500). These also get SEC submissions + Massive details + Massive events. At 3 Massive calls per ticker and 5/min, 500 tickers ≈ 5 hours; the enrichment loop rate-limits itself and is resumable, and re-runs skip tickers already enriched today.

## Source-field → column mapping

The provider-level mapping is in [task-01-findings](task-01-findings.md). Transformation rules on top of it:

| Column | Rule |
|---|---|
| security_id | allocated internally, see below |
| cik | SEC file `cik`, as UInt32 (strip zero padding) |
| ticker | SEC file `ticker` verbatim (`BRK-B` keeps the dash) |
| share_class | suffix after `-` in the ticker (`B` for BRK-B), else `''` |
| company_name | SEC file `name` |
| exchange | SEC display name (`Nasdaq`, `NYSE`, `CBOE`...). Massive MIC codes are mapped to the same names: XNAS→Nasdaq, XNYS→NYSE, ARCX/BATS→CBOE-style names |
| symbol_history | see below |
| country_code | `US` unless SEC `addresses.business.stateOrCountry` is a non-US country code |
| trading_currency | Massive `currency_name` uppercased; default `USD` |
| sic | SEC submissions `sic`, parseInt, default 0 |
| sic_description | SEC submissions `sicDescription` |
| sector, industry | from SIC division ranges (static table in `src/lib/sic.ts`) |
| website | Massive `homepage_url`, else SEC `website`, else `''` |
| description | Massive `description`, else `''` |
| ceo | `''` (no source, v1) |
| headquarters | SEC `addresses.business` → `City, ST` title-cased |
| employee_count | Massive `total_employees`, default 0 |
| founded_year | 0 (no source, v1) |
| fiscal_year_end | SEC `fiscalYearEnd` (MMDD string) |
| is_active | true if present in today's SEC ticker file; existing rows that disappear from the file are re-inserted with `is_active = false` |
| source | `sec` for base rows, `sec+massive` for enriched |
| source_updated_at | fetch timestamp of the SEC file |
| version | sync start time in epoch milliseconds; identical for all rows of one run |

## Identity and security_id allocation

A security's natural key is `(cik, ticker_root, share_class)` where ticker_root strips the class suffix. Tickers change, so matching runs in priority order against the current ClickHouse state:

1. `share_class_figi` match (only for enriched rows where we stored it — v1 skips FIGI storage, so this is future).
2. `(cik, share_class)` match — a CIK plus share class identifies the security even if the ticker changed. If a CIK has multiple securities of the same class (rare), fall to 3.
3. `(cik, ticker)` exact match.
4. Ticker found inside an existing row's `symbol_history` with matching CIK.

No match → new security: `security_id = max(existing) + 1`, allocated in memory during the run (single writer, no concurrency). IDs are never reused; a delisted company keeps its row with `is_active = false`.

Ambiguity rule: if a ticker matches one existing row by ticker but a different row by CIK, the CIK wins (tickers get recycled across companies; CIKs don't). The displaced ticker match is logged as a validation warning, not auto-merged.

## symbol_history construction

For enriched tickers, Massive events (`types=ticker_change`) give dated changes. Sort ascending; each event becomes a tuple with `valid_from` = event date and `valid_to` = next event's date, null for the last. Exchange inside tuples is the current exchange (Massive events don't date exchange moves; acceptable for v1).

For base-tier rows, one tuple: current ticker/exchange, `valid_from = '1970-01-01'` (meaning "unknown start"), `valid_to = null`.

On later runs, if the current SEC ticker differs from the stored row's ticker and no event data explains it, close the old tuple with `valid_to = today` and append the new ticker with `valid_from = today`.

## Missing data

- Missing submissions JSON (CIK not on data.sec.gov): keep base fields, sic = 0, log warning.
- Massive 404 for a universe ticker: ingest as base-tier row, log warning.
- Massive rate-limit response (429): sleep and retry; the enrichment loop already spaces calls 12s apart.
- Empty/whitespace company name or ticker: drop the row, count as validation failure.

## Replay-safe insert

- Rows are only inserted, never updated (`ReplacingMergeTree(version)` dedups by `security_id`).
- `version` = run start epoch ms, so re-running the same day just supersedes with identical data — harmless.
- Only changed rows are inserted: each candidate row is compared field-by-field (excluding `ingested_at`, `version`) against the current ClickHouse row; unchanged rows are skipped. First run inserts everything.
- One batch insert per run (JSONEachRow via `@clickhouse/client`; switch format if batches grow past ~100k rows).
- Raw snapshots in `data/raw/<date>/` allow full replay without refetching.

## Data-quality checks

Run after insert; failures are reported in the run output (and fail the Trigger.dev run):

1. `security_id` uniqueness: `SELECT security_id FROM securities FINAL GROUP BY security_id HAVING count() > 1` → must be empty.
2. Universe coverage: every ticker in `universe.txt` exists and `is_active = true`.
3. Count drift: active-row count must not drop more than 5% versus the previous run (guards against a truncated SEC file).
4. CIK sanity: no active row with `cik = 0`.
5. Enrichment completeness: enriched rows must have non-empty `description` and `website`; misses are warnings.

## Verified run (2026-07-17)

`make up && npm run sync:securities` against local ClickHouse:

- First run: 10,426 rows inserted (full SEC universe), 10 enriched, 0 warnings, all quality checks passed.
- Second run: 0 inserted, 10,426 unchanged — the diffing makes re-runs no-ops.
- Spot checks: META carries `[('FB', ..., 2012-05-18, 2022-06-09), ('META', ..., 2022-06-09, null)]` in `symbol_history`; BRK-B has `share_class = 'B'`.

Provider quirks found while running:

- Massive spells share classes with a dot (`BRK.B`); SEC uses a dash (`BRK-B`). `massive.ts` converts before calling, and HTTP 400 is treated as "not found".
- Massive's events endpoint returns the root ticker (`BRK`, not `BRK-B`) in ticker-change events, so a share class's history may show the root symbol. Acceptable for v1.
- ClickHouse `JSONEachRow` wants named tuples (`symbol_history`) as JSON objects, not arrays, on both insert and select.

## Code layout

```text
package.json
trigger.config.ts
src/
  trigger/sync-securities.ts   # Trigger.dev schedules.task wrapper
  cli/sync-securities.ts       # npm run sync:securities
  lib/
    sec.ts          # SEC fetchers (ticker file, submissions)
    massive.ts      # Massive fetchers (details, events) + rate limiter
    normalize.ts    # provider JSON → canonical SecurityRecord
    reconcile.ts    # matching, id allocation, symbol_history, diffing
    clickhouse.ts   # client, schema DDL, load current, batch insert
    sic.ts          # SIC → sector/industry mapping
data/
  universe.txt      # one ticker per line, enriched tier
  raw/<date>/       # snapshots (gitignored)
```
