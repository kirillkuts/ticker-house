# 022 — Put explanations in the widget, not long chat text

## Problem
Asking "Show the metrics behind AAPL's scores… and explain each score in plain language" produces a metrics table widget on canvas plus a wall of explanatory text in the chat (one long paragraph per metric: P/E, net margin, ROE, revenue growth, debt/equity).

The user doesn't want the long text. The explanation should live on the widget itself.

## Desired behavior
- Attach explanations to the widget instead of dumping them as chat prose.
- Since the text explains columns: each explainable column header (or cell) should have a visible affordance that it's hoverable (e.g. subtle underline, info icon, cursor change).
- Hovering shows a tooltip with the plain-language explanation for that metric/column.
- Chat response should stay short (one or two lines), pointing to the widget.

## Screenshots
- Image 1: chat item "Metrics · JPM, MSFT, META +7 · latest · pe_ttm, net_margin, roe +2 on canvas" that was clicked.
- Image 2: resulting canvas table + the long per-metric text in the chat panel (highlighted).

## Status
**Status:** done

Resolution: every metric now carries a plain-language `explain` string in the metric
registry, threaded through `MetricColumn` into the widget. `MetricLabel` renders each
metric name (table headers, compare rows, KPI tiles, chart titles) with a dotted
underline + help cursor as the hover affordance and shows the explanation in a
fixed-position tooltip (escapes the table's overflow-x clipping; clamped to the
viewport). Old persisted results without `explain` fall back to the registry by key.
The chat system prompt now tells the model the widget explains itself: on "explain
each metric" asks it keeps to one comparative paragraph instead of per-metric
definition essays. Typecheck + eslint clean; chat page serves 200 with the change.
