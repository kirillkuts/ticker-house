# 024 — Review available per-company metrics, add them as overview widgets

## Request
Review which additional metrics are available per company in the data (see `web/lib/metric-registry.ts` and the underlying tables) and add the useful ones as widgets/tiles on the company overview.

Current overview shows: market cap, P/E (TTM), revenue (TTM), net margin (TTM).

## Steps
- Enumerate all metrics available per company that aren't shown on the overview.
- Pick the ones worth surfacing (e.g. EPS, dividend yield, free cash flow, gross margin, ROE, debt/equity, etc. — confirm against actual data).
- Add them as widgets/tiles to the company overview.

## Status
**Status:** done

Resolution: reviewed the 24-metric registry against what the overview renders.
Already covered elsewhere in the view: P/S (valuation bars), gross/operating
margins (profitability chart), ROA (profitability tiles), balance-sheet items
(health tiles, task 023), growth rates (score details + revenue hint). Genuinely
missing from the headline row were Net income (TTM), Diluted EPS (TTM, with YoY
growth hint), Free cash flow (TTM) and Return on equity — the headline KPI grid
now shows all 8 tiles. Bonus: `MetricLabel` (task 022) is exported and every stat
tile label on the overview (headline, profitability, balance sheet) now carries
the plain-language hover tooltip from the registry. Left out on purpose:
operating_cash_flow / gross_profit / operating_income (redundant with margins and
FCF for an overview), last_close (already the price header). Typecheck + eslint
clean.
