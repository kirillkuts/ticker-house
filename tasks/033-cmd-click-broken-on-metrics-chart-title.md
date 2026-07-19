# 033 — Cmd+click does nothing on the metrics chart title

## Bug

On a standalone metrics view (e.g. "Chart GOOGL's diluted EPS over the last 5 years" → Metrics · GOOGL · annual_5y · eps), the "Diluted EPS" title shows the hover affordance — the tooltip with the definition and the "Cmd+click: explain this" hint — but cmd+clicking it does nothing. No question is asked, no explanation appears.

## Steps to reproduce

1. Ask "Chart GOOGL's diluted EPS over the last 5 years".
2. Hover the "Diluted EPS" title on the canvas chart: tooltip and cmd+click hint appear.
3. Cmd+click it. Nothing happens.

## Expected

Cmd+click triggers the "what is this?" explanation, same as on stat tiles in the company overview (task 020). If the fix lands after task 032, the answer should open in the anchored popover.

## Likely area

The cmd+click handler may only be wired on the overview widget's elements, not on the standalone metrics widget, or the title element eats the click. The hint tooltip rendering while the click does nothing suggests the affordance and the handler are wired separately.

## Status
**Status:** done

Resolution: two layers. (1) Metric labels (chart titles, table headers, compare
rows, KPI tiles) are now first-class explain targets via data-explain="metric" on
MetricLabel, so cmd+hover rings them and cmd+click scopes the question to that
metric. (2) The actual "nothing happens" was the popover's predecessor flow dying
silently: the explanation UI was keyed to the clicked view's wrapper, and when the
still-streaming answer switched the active canvas an instant later, the wrapper
unmounted and took the UI with it. The task-032 popover is viewport-fixed and
rendered at the Chat root, so it survives the switch. Verified live: cmd+click on
a "Return on equity" label in a metrics compare table opens the popover with an
ROE explanation (web/scripts/verify-032-033-ui.mjs). Also fixed along the way: the
grown ~100-ticker universe broke company overviews entirely (metric-query MAX_LIMIT
truncation) — committed separately as a0ffa9b.
