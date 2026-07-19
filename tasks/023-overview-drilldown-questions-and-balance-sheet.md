# 023 — Overview drill-down questions + balance sheet section

## Requests
1. The company overview widget should offer follow-up questions to drill down into fundamentals, e.g.:
   - Where is revenue coming from? (segments/geography)
   - Which expenses does the company have? (expense breakdown)
   - Similar drill-downs alongside the existing "Revenue & profit trend" and "Closest business peers" chips.
2. Add balance sheet information to the overview (assets, liabilities, cash, debt, equity), or a drill-down question that opens a balance sheet view.

## Context
Screenshot: NVDA company overview on canvas. Current follow-up chips: "Is it a good company?", "Rank peers by market cap", "Revenue & profit trend", "Closest business peers". No revenue-source, expense, or balance-sheet entry points.

Related tasks: 010 (deeper expense line items), 011 (segment data pipeline), 012 (expense breakdown and segment widgets).

## Status
**Status:** done

Resolution: the About section now offers "Where revenue comes from" (routes to
show_segments) and "What it spends money on" (routes to show_expense_breakdown)
ahead of the existing trend/peers chips. The Financial health section grew into a
real balance-sheet row — Total assets, Total liabilities, Equity (with plain hints:
owns / owes / difference), Cash, Total debt, Current ratio — backed by two new
metrics (total_assets, total_liabilities) added to the overview's TTM snapshot in
views.ts, plus a "Balance sheet history" follow-up chip (5-year assets/liabilities/
cash/debt table). Verified against ClickHouse: NVDA returns assets $259.5B −
liabilities $64.0B = equity $195.5B. Typecheck + eslint clean. Overviews saved
before this change simply show "—" for the two new tiles.
