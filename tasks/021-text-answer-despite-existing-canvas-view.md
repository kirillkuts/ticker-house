# 021 — "Where does NVDA spend its money?" answered in text, no graphic

**Status:** todo

From user screenshot: the question produced a long bullet-list text answer ("Based on NVDA's expense breakdown (already on your canvas), here's where the money goes... Cost of Revenue: $62.5B (29%)...") instead of a widget. Why: the [canvas] block told the model the expense breakdown was already pinned (from an earlier answer), so it skipped the view tool and recited the numbers in prose — exactly what the view-first rule forbids.

Wanted:
- A question whose answer is a view must ALWAYS produce that view in the answer, even when a similar view is already on some canvas. Re-calling the tool is cheap and gives the answer its own canvas (canvas mode, task 007). The model must never recite a view's numbers in text because "it's already on your canvas".
- Fix in web/trigger/chat.ts system prompt: strengthen the view-first rule with this exact failure mode — the [canvas] block is context, not a substitute for calling view tools; numbers always come from a fresh view call in THIS answer.
- Verify: with an expense breakdown already on canvas, ask "Where does NVDA spend its money?" again — expect a rendered expense-breakdown widget + one short takeaway paragraph, not a bullet list of figures.

Files: web/trigger/chat.ts (system prompt, possibly edit_canvas/tool descriptions).

Done when: repeat questions over pinned views still answer with widgets.
