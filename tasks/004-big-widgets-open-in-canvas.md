# 004 — Big widgets open straight in canvas

**Status:** done

Resolution: the auto-canvas condition in Chat.tsx now fires for any message with 2+ view calls OR at least one BIG view (company overview, price chart, fundamentals — new module-level BIG_VIEW_TYPES set). Metric tables and chips stay inline. The compact reference card in chat and follow-ups-from-canvas already existed for multi-view answers and are reused unchanged. Typecheck passes; worth a quick live click-through of "full overview of MSFT" when next in the browser.

From user screenshot: a full company overview renders inline in the chat column, making the chat a giant scroll. Big widgets should go straight to the canvas panel even when the answer has only one widget.

Wanted:
- When a "big" widget arrives (company overview at minimum; likely also the full price dashboard and fundamentals), open the canvas automatically and render it there. The chat column shows a compact reference card (title + open-in-canvas), not the full widget.
- Currently canvas only activates with multiple views — remove that condition for big widget types.
- Small results (metric tables, follow-up chips, short answers) stay inline.

Files: web/components/Chat.tsx (canvas logic, isViewToolPart / ViewRef handling), web/components/widgets/CompanyOverview.tsx.

Done when: asking "full overview of MSFT" opens the canvas immediately with the overview, chat column stays short with a reference card, follow-up chips still work from the canvas.
