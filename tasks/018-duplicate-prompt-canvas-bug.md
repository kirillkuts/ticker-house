# 018 — Asking the same view prompt twice breaks the canvas tabs

**Status:** done

Resolution (three deterministic fixes in Chat.tsx):
1. Duplicate labels: repeat questions now get a "· 2" / "· 3" suffix on their tab (labelCounts in the grouping loop), so tabs are always distinguishable.
2. "Two tabs look active": inactive tabs had a blue hover border that read as a second selection — hover is now neutral; blue means active, exclusively. Exactly one tab can be active by construction (`c.id === activeCanvas?.id`, ids unique per message).
3. Id-collision risk: the synthetic tile-click messages used a Date.now() stamp for message ids (two clicks in the same millisecond → duplicate ids → broken canvas lookup); now crypto.randomUUID().
The content/label mismatch in the screenshot could not be reproduced headlessly; the likeliest remaining cause is the model answering the repeat question without a view call, which is task 021's fix. Typecheck passes — re-test by clicking the same overview chip twice.

From user screenshot (arrow at the canvas tab strip): after clicking the same pre-prompted question again ("Give me the full overview of NVDA"), the tab strip shows TWO tabs with that identical label, more than one tab looks highlighted/active, and the visible canvas content doesn't match the highlighted label (tab says "full overview", canvas shows the diluted EPS chart). Clicking the same view prompt causes the bug.

Investigate in web/components/Chat.tsx canvas grouping/switcher:
- Label collision: labels come from the nearest preceding user message, so repeat questions produce identical tabs — disambiguate (e.g. suffix "· 2" or timestamp) or dedupe.
- Active-tab styling: exactly one tab may be visually active; check `activeCanvasId` vs the fallback (`?? canvases[canvases.length - 1]`) — the fallback can make a different tab LOOK active than `activeCanvasId` says when the id points at a canvas that vanished.
- Content/label mismatch: verify the label lookup walks to the correct triggering user message when consecutive answers exist (assistant messages with no user message between them, canvas-block stripping, suggest_follow_ups messages).
- Consider: should re-asking an identical question reuse/replace the existing canvas instead of minting a duplicate?

Repro: open a chat, click the same overview chip twice, inspect the tab strip.

Done when: re-asking the same question yields a tab strip with unambiguous labels, exactly one active tab, and the shown canvas always matches the active tab.
