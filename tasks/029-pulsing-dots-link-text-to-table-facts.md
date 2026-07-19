# 029 — Pulsing dots link explanation text to referenced table facts

## Idea

When an answer explains something and the explanation references data shown in a table (or chart) on canvas, the widget should visually anchor those facts. Next to each referenced value in the table, show a small pulsing dot. Hovering the dot reveals the relevant sentence from the explanation as a tooltip.

Goal: instead of reading a long wall of text on the left (e.g. the GOOGL fundamentals narrative), the user can scan the table and hover the dots to get the explanation piece by piece, in context.

## Example (screenshot)

GOOGL annual fundamentals view. The chat text says "Revenue has nearly tripled from $137B (2018) to $403B (2025)", "net margin jumped to nearly 30% by 2021, dipped in 2022, recovered to 33% by 2025", "EPS rebound to $10.81 by 2025", "FCF grew from $23B to $73B". Each of those facts maps to specific cells: FY2018/FY2025 revenue, the net margin line points, the FY2025 EPS cell, the FY2018/FY2025 FCF cells. Those cells get pulsing dots; hover shows the matching explanation snippet.

## Mechanics to work out

- The model output needs to carry the mapping: each explanation claim annotated with the view/cell it references (e.g. row period + column, or chart series + point).
- Widget renderer places a pulsing dot beside annotated cells/points and shows the snippet in a hover tooltip.
- Should also help "visualize changes" generally: when an explanation is about a change between two periods, the dots could mark both endpoints.
- Complements task 022 (explanations belong in the widget, not chat text): this is the mechanism that moves the explanation into the widget.

## Status
**Status:** done

Resolution: new highlight_facts tool — after show_fundamentals and its takeaway text,
the model maps each concrete claim to table cell(s) as {period, column, snippet}
(both endpoints for change claims; prompt guidance added). Client-side, Chat.tsx
collects each assistant message's markers and provides them to sibling widgets via
FactMarkersContext (both inline and canvas render paths); the fundamentals table
(which also gained a Net margin column) renders a pulsing dot (FactDot, animate-ping)
beside each referenced value, with the snippet in a fixed-position hover tooltip.
Period labels match loosely (case/space-insensitive) and markers filter by ticker.
highlight_facts is excluded from view-part handling so it never shows as a canvas
view or loading placeholder. Verified live end-to-end (web/scripts/verify-029b-ui.mjs):
GOOGL annual fundamentals ask produced dots at the FY2018/FY2025 revenue and net
margin cells, hover shows "Revenue nearly tripled from $137B in FY2018 to $403B in
FY2025." Screenshot checked. v1 scope: the show_fundamentals table (the task's
example); chart-point anchors are a possible follow-up.
