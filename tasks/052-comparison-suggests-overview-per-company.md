# 052 — Comparison widgets suggest an overview chip per compared company

**Status:** done

## Task

When a widget compares several companies (e.g. "Compare net margins for MSFT, GOOGL and META"), the sub-prompt chips should include an overview chip for **each** company in the comparison. Today only one appears ("GOOGL overview" in the screenshot); MSFT and META get nothing.

## Expected

Chips under the comparison widget: "5-year history", plus "MSFT overview", "GOOGL overview", "META overview" (one per compared ticker).

## Notes

- Likely prompt/tool guidance: instruct the model that comparison views list an overview follow-up per member, or generate these chips deterministically client-side from the view's ticker list instead of relying on the model.
- Deterministic client-side generation is probably better: comparison widgets know their tickers, so append the overview chips automatically and let the model's own suggestions cover the rest.
- Cap sensibly for wide comparisons (category-level, 8+ members) — maybe show first N with overflow.
