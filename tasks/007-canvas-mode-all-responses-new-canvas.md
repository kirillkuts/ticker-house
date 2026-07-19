# 007 — Once canvas mode is active, every visual answer gets a new canvas

**Status:** done

Resolution: in the canvas grouping loop, `qualifies` is now true for any view-bearing assistant message once an earlier canvas exists (`canvasMode = canvases.length > 0` at that point in the loop), in addition to the original 2+ views / big-view rule for the first canvas. Fully derived, so restored chats behave the same. Edge case (accepted): clearing all earlier canvases exits canvas mode for later small answers until a dashboard answer re-creates one. Typecheck passes.

From user: "once canvas mode is active, all new responses go to a new canvas no matter what number".

Current behavior (task 006): an answer only gets its own canvas when it has 2+ views or a big view (overview, price chart, fundamentals). Small results like a single metric table stay inline even when the canvas is already open.

Wanted:
- Once any canvas exists in the chat (canvas mode is active), EVERY subsequent answer that produces at least one view gets its own new canvas — regardless of view count or widget size.
- The first canvas is still created by the existing rule (2+ views or a big view), so a chat that never triggers canvas mode keeps small results inline.

Implementation: in the canvas grouping loop in web/components/Chat.tsx, `qualifies` becomes true for any view-bearing assistant message when at least one canvas was already created for an earlier message (`canvases.length > 0` at that point in the forEach). Stays fully derived, so restores work.

Done when: after the first dashboard answer opens the canvas, a follow-up producing a single small metric table lands on a new canvas (with a new history tab), not inline.
