# 040 — Cmd+click explain still dead on the expense-breakdown legend

## Bug

On the "where the revenue goes" widget (e.g. "Where does ANET spend its money?"), the legend row (Cost of revenue $3.2B, R&D, Sales & marketing, General & admin, …) doesn't respond to cmd+click. The "Cmd+click: explain this" hint renders, but stuck at the top-left corner of the screen instead of next to the hovered legend entry, and no popover opens on click.

Task 037 fixed this for the business-segments widget's legend; the expense-breakdown widget apparently has its own legend that never got the data-explain wiring.

## Steps to reproduce

1. Ask "Where does ANET spend its money?".
2. Cmd+hover a legend entry like "General & admin $141.9M": the hint appears mispositioned at the viewport corner.
3. Cmd+click. Nothing opens.

## Expected

Same as task 037: legend entry rings on cmd+hover, hint anchored to it, cmd+click opens the explain popover scoped to that expense line.

## Notes

- Audit all widgets with legends (fundamentals, metrics compare, segments, expenses, dashboard tiles) for the data-explain wiring so this stops recurring one widget at a time.
- The corner-positioned hint suggests the hover handler fires without a target rect — the same missing wiring, not a separate positioning bug.

## Status
**Status:** done

Resolution: legend-entry data-explain wiring audited across ALL widgets with
legends — expense breakdown (the reported one), fundamentals, and the overview's
LegendRow (growth/profitability sections; upgraded from a whole-row target to
per-entry). Segments already had it (037); MetricResult uses recharts' built-in
legend inside the chart container, which is already a chart target. The
corner-positioned hint was the same missing wiring (no target rect), not a
separate bug. Verified live on "Where does ANET spend its money?": legend entry
opens the popover with a grounded answer (web/scripts/verify-040-041-ui.mjs).
