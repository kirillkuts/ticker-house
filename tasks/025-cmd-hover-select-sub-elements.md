# 025 — Cmd+hover should select sub-elements, not just the whole widget

## Problem
Cmd+hover on the canvas (the "what is this?" flow from task 020) only lets you select a full widget. You can't target individual pieces inside a widget.

## Desired behavior
- Cmd+hover highlights finer-grained elements: individual charts, section titles, text blocks, legend items, etc. (e.g. just the "Growth" annual bar chart, or just the "Revenue $215.94B" legend entry inside the NVDA overview).
- Clicking a sub-element carries that specific element's context with the prompt, not the whole widget's.

## Context
Screenshot: NVDA overview canvas, arrow pointing at the Growth section's Revenue/Net income legend. Related: task 020 (cmd+click "what is this?").

## Status
**Status:** done

Resolution: explain mode (Cmd held) now targets the finest explainable element
under the cursor instead of only the whole widget. Recognized targets: charts
(recharts containers), tables, section headings, text blocks, plus anything a
widget labels with `data-explain` (legend rows and stat tiles are annotated).
Hovering draws a blue ring around just that element with a small kind badge
("chart", "legend", "stat tile"…); Cmd+click sends a question scoped to that
element — naming its kind, its enclosing section title, and quoting up to 240
chars of its visible content (charts fall back to textContent so SVG axis/legend
labels are captured) — alongside the view's refKey/describePart context. Clicking
outside any sub-element keeps the old whole-view explain. Sub-target state clears
on Cmd release, window blur, and mouse leave. Typecheck clean; the one eslint
error in Chat.tsx pre-exists this change (canvas drag effect).
