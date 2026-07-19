# 028 — Old view flickers after clicking a widget sub-prompt

**Status:** done

Resolution: root cause in the canvas grouping in Chat.tsx — `modelEdited`
counted ANY `tool-edit_canvas` part, including a call that had only started
streaming. Sub-prompt answers call a view tool first (canvas materializes,
takes focus), then `edit_canvas` with add_new_views; the instant that call
part appeared, the new canvas was disqualified, its entry list emptied, it
dropped from the canvas list, and the display fell back to the previous
canvas — the ~1s "old view flash" — until the edit output arrived and the
pinning effect refocused it. Fix: only a COMPLETED edit that does NOT add
this answer's views exempts the message (pending edits keep the canvas
qualified; completed add_new_views edits qualify it too, covering the render
before the pinning effect runs). Verified end-to-end against the live model
pipeline (web/scripts/verify-028-ui.mjs): NVDA overview → click "Is it a good
company?" chip → canvas sampled every 100ms for 45s — switched to the new
view, the overview never flashed back, metrics view settled.

## Bug

Clicking a sub-prompt chip inside a widget (e.g. "Is it a good company?" on the NVDA company overview) starts rendering the new prompt's view, but then the old view flashes back on screen for about a second before the new view settles.

## Steps to reproduce

1. Ask "Give me the full overview of NVDA" so the overview widget opens on canvas.
2. Click a sub-prompt chip on the widget, such as "Is it a good company?".
3. Watch the canvas: the new view starts, then the previous view flickers back briefly.

## Expected

The transition goes straight from the old view to the new one. No flash of the stale view mid-transition.

## Likely area

Canvas view switching / tab state when a new question is spawned from a widget sub-prompt. Probably a race between the optimistic new-view render and a stale state update or refetch that re-selects the old view. Related past work: task 018 (duplicate prompt canvas bug) and commit d71cf80 (canvas tab confusion when re-asking the same question).
