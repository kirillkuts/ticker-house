# 041 — Cmd+click explain on Company score row titles

## Task

In the Company score section of the overview widget, the score row titles (Value, Growth, Profitability, Health, Cash flow) aren't explain targets. Make each title cmd+clickable so the explain popover opens scoped to that score: what the score measures, which metrics feed it (the sub-line already shown, e.g. "P/E 40.4x vs peer median 27.9x"), and how to read the /5 value for this company.

## Notes

- Same data-explain wiring as stat tiles / metric labels / legend entries (tasks 032, 033, 037, 040).
- The radar chart axis labels (Value, Growth, … around the pentagon) can get the same treatment if cheap; the row titles are the ask.
- Include the score value and sub-line metrics in the grounding context so the answer is company-specific, not a generic definition.

## Status
**Status:** done

Resolution: each Company score row (ScoreMeter) is a data-explain="company score"
target — the whole row, so the clicked element's innerText carries the axis name,
the /5 value AND the metric sub-line ("P/E 31.7x vs peer median 24.8x") into the
grounding context, making answers company-specific. Radar axis labels skipped
(SVG ticks, the row titles were the ask). Verified live on the NVDA overview:
cmd+click on the Value row opened the popover with "Value score of 1.1/5 rates
how cheap NVDA is relative to…" (web/scripts/verify-040-041-ui.mjs + screenshot).
