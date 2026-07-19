# 012 — Expense breakdown + segment widgets

**Status:** done

Resolution: added expenseBreakdown()/segmentBreakdown() to web/lib/views.ts, tools show_expense_breakdown/show_segments in web/trigger/chat.ts (with routing guidance in the system prompt), widgets ExpenseBreakdown.tsx/SegmentBreakdown.tsx, wired into Chat.tsx (ToolPart, labels, BIG_VIEW_TYPES so they open on canvas). Expense view stacks cost of revenue/R&D/S&M/G&A(or combined SG&A)/other/operating income to total revenue, with op-margin trend + %-of-revenue table; degrades to an error steering to show_fundamentals for JPM/BRK-B. Segment view handles three real data traps found in verification: TSLA-style parent aggregates on the product axis (removed via subset-sum parent detection against consolidated revenue), ISO-country members double-counting region members in geography (META US/CN dropped), and BRK-B members overshooting consolidated revenue by 49% (stackable=false → grouped bars). Verified: full 10-ticker sweep against live ClickHouse (stack/revenue ratio 1.00 for all stacked reporters), web typecheck and production build pass. Not driven end-to-end through a live agent chat session (needs trigger dev running) — worth one manual smoke test: "where does Meta spend its money?" and "Meta revenue by segment".

Depends on: 010 (deeper expense lines), 011 (financial_segments table).

Surface the new data in chat so "where does Meta spend its money?" and "margin is 40% — what are the expenses?" render real widgets instead of prose.

Two views + widgets:

1. Expense breakdown — for one company, latest annual/TTM: revenue → cost_of_revenue → gross_profit → R&D / selling_and_marketing / general_and_admin (fall back to combined selling_general_admin when the split is null) → operating_income, plus depreciation_amortization and share_based_compensation as context lines. Render as a waterfall or stacked composition with % of revenue per line. Multi-period option to show trend.
2. Segment breakdown — revenue and operating income per business segment over time (from financial_segments, axis=business), plus a geography split (axis=geography). Segment names shown with their as-reported labels.

Wiring (follow the existing pattern exactly):
- web/lib/views.ts: add `expenseBreakdown()` and `segmentBreakdown()` queries (see fundamentals()/companyOverview() for shape, resolveSecurity for symbol resolution).
- web/trigger/chat.ts: add tools `show_expense_breakdown`, `show_segments`; update the system prompt so the model routes "expenses", "spend", "segments", "where does the money go" questions to them and knows segment coverage limits.
- web/components/widgets/: ExpenseBreakdown.tsx, SegmentBreakdown.tsx (recharts, match existing widget styling); register in Chat.tsx ToolPart mapping.
- Read the dataviz skill before writing chart code (project convention for charts).

Edge cases: companies without S&M/G&A split (NVDA, TSLA, LLY) show combined SG&A; financials (JPM, BRK-B) have no cost_of_revenue — the expense view must degrade gracefully, not show empty bars; single-segment companies get a clear "reports one segment" state.

Done when: asking "where does Meta spend its money" in chat yields the expense breakdown widget with real numbers, asking about Meta's segments yields Family of Apps vs Reality Labs revenue/operating income, both typecheck and render in the canvas, and non-split/financial companies degrade gracefully.
