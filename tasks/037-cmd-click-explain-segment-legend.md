# 037 — Cmd+click explain doesn't work on segment legend items

## Bug

On the business segments widget (e.g. "Show ACN's revenue by segment"), the legend row at the top (Americas Segment $35.1B, EMEA Segment, Communications Media And Technology, …) shows the "Cmd+click: explain this" hint on hover, but cmd+clicking a legend item does nothing.

## Steps to reproduce

1. Ask "Show ACN's revenue by segment".
2. Hover a legend entry (e.g. "Products Segment") — the cmd+click hint appears.
3. Cmd+click it. No explanation popover opens.

## Expected

Cmd+click on a legend item opens the explain popover (task 032) scoped to that segment: what the segment is, what the shown figure means.

## Notes

- Same failure shape as task 033 (hint shown, handler missing). Check the segments widget's legend elements have the data-explain wiring, not just the hover affordance.
- Also visible in the screenshot: "EMEASegment" is missing a space in the label — fix the label formatting while in there.

## Status
**Status:** done

Resolution: the segments widget's three legend rows (segments, products,
geography) mark each entry with data-explain="legend entry", so cmd+hover rings
the entry and cmd+click opens the explain popover scoped to it (segment name +
shown figure as context). Label spacing fixed at the source: humanizeMember() in
views.ts splits glued camel-case names in BOTH the filing label and the member
fallback ("EMEASegment" → "EMEA Segment", "FamilyOfApps" → "Family Of Apps") while
keeping "IPhone"/"IPad" intact (the CAPS→Word rule requires a 2+ capital run).
Along the way: the chat system prompt still hardcoded the original 10-ticker
coverage list, so the model refused segment questions for the grown universe
(committed separately). Verified live on ACN: spaced labels, legend cmd+click
opens the popover (web/scripts/verify-034-035-037-ui.mjs).
