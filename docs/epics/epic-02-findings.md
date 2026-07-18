# Epic 2 findings — Normalized financial statements

Source: SEC company facts API, free, keyed by CIK, same auth as other SEC endpoints (User-Agent header, 10 req/s).

```bash
curl -s -H "User-Agent: TickerHouse kirill.kuts.dev@gmail.com" \
  https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json | jq
```

One JSON per company: `facts.us-gaap.<Concept>.units.<Unit>[]`, each fact carrying `start` (durations only), `end`, `val`, `accn`, `fy`, `fp`, `form`, `filed`. Verified live 2026-07-17; Apple has 503 us-gaap concepts.

Pipeline: `npm run sync:financials` — for each ticker in `data/universe.txt`:

```text
fetch companyfacts JSON (SEC, fast)
    → save raw snapshot
    → extract facts for mapped concepts only → financial_facts
    → assemble normalized periods → financial_periods
insert both tables, one version per run
quality checks
```

## Concept map

Lives in `src/lib/concepts.ts` (source of truth) with `mapping_version` stamped on every period row. Each normalized field maps to a priority-ordered concept list; the first concept that has data for a period wins. Full list in the code; shape:

```text
revenue    ← RevenueFromContractWithCustomerExcludingAssessedTax | Revenues | SalesRevenueNet
net_income ← NetIncomeLoss
...
```

Computed fields (not sourced): `gross_profit` falls back to `revenue − cost_of_revenue` when unreported, `total_debt = short_term_debt + long_term_debt`, `free_cash_flow = operating_cash_flow − capital_expenditure`, `long_term_liabilities = total_liabilities − current_liabilities` fallback.

## Period assembly — the three XBRL quirks

**1. Duration vs instant.** Income and cash-flow concepts are durations (`start`+`end`); balance-sheet concepts are instants (`end` only). A normalized period is keyed by its duration; instant facts attach to any period whose `period_end` matches their `end`.

**2. Quarter vs YTD durations.** A 10-Q reports facts twice: the discrete quarter (~91 days) and fiscal-year-to-date (~182/~273 days). Classification by duration length: 80–100 days = quarter, 350–380 = annual, anything else = YTD (kept only for differencing). Annual rows come from 10-K FY durations.

**3. Derived quarters.** Two derivations, both marked `form = 'derived'` on nothing — they live inside normal rows, but `source_concepts` records `derived:<rule>` per field:

- **Q4**: companies don't file a Q4 10-Q; Q4 duration fields = FY − (Q1+Q2+Q3) when the FY row and all three quarters exist.
- **Cash-flow quarters**: cash-flow facts are YTD-only. Quarter value = YTD(end of Qn) − YTD(end of Qn−1); Q1 = the ~91-day YTD itself.

Latest filing wins: facts are sorted by `filed` date, so a restated value from a later filing (or 10-K/A) overwrites the original within one run; `is_amendment` is true when the winning fact's form ends in `/A`.

## financial_facts

Raw preserved facts, only for mapped concepts (keeps the table at ~40 concepts × periods per company instead of 500+). Schema per `clickhouse.md` §3. Unit selection: `USD` for money, `shares` for share counts, `USD/shares` for EPS.

## financial_periods

Schema per `epic-02.md`. Keys: `(security_id, period_type, period_end)` with `period_type` ∈ `quarter | annual`. `fiscal_year`/`fiscal_period` come from the winning fact's `fy`/`fp`. `filing_date` = earliest `filed` among the row's facts; `source_accession` = the accession of the fact that supplied `revenue` (or the first field present). `currency = 'USD'` (foreign filers using IFRS taxonomy are out of scope for v1 and skipped with a warning).

## Missing data and edge cases

- CIK with no companyfacts JSON (404): warning, skip.
- Concept present but no USD unit: field left NULL.
- Q4 derivation skipped when any of Q1–Q3 is missing; the annual row still exists.
- Periods older than 2009 (pre-XBRL mandate) are sparse; ingest whatever exists, no cutoff.

## Insert and replay

Same policy as tasks 2/4: insert-only, `version` = run epoch ms, `ReplacingMergeTree` dedups, raw snapshots in `data/raw/<date>/facts_<ticker>.json`, batches ≤100k rows.

## Verified run (2026-07-17)

`npm run sync:financials` over the 10-ticker universe:

- 50,650 raw facts and 903 normalized periods inserted (roughly 90 periods per company, back to 2008–2009).
- Apple spot-check against real filings: Q1 FY2025 revenue 124.3B, FY2025 416.16B / EPS 7.46, derived Q4 revenue 102.47B — all match Apple's reported numbers. Quarterly operating cash flow correctly produced by YTD differencing.

Pitfalls hit and fixed during implementation:

- **Non-additive fields**: EPS and weighted-average share counts must never be derived by FY − quarters or YTD differencing (buybacks make the arithmetic go negative). They are exact-fact-only; derived Q4 rows leave them NULL.
- **Noncontrolling interests**: `StockholdersEquity` is parent-only, so assets ≠ liabilities + equity for TSLA and BRK (39 and 17 period rows). The balance-sheet identity check is a warning, not a failure.
- ClickHouse syntax: alias goes before FINAL (`financial_periods AS a FINAL`).

## Data-quality checks

1. No duplicate `(security_id, period_type, period_end)`.
2. Balance-sheet identity: `|total_assets − (total_liabilities + shareholders_equity)| / total_assets < 1%` on rows where all three exist.
3. Every universe ticker has at least one annual period.
4. Annual revenue = sum of its four quarters within 2% (where all five rows exist); violations are warnings, not failures (fiscal calendar edge cases).
