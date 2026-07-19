# 032 — "What is this?" answer appears in a popover next to the element, not in chat

## Task

When the user cmd+clicks an element on canvas to ask "what is this?" (e.g. the "Total liabilities" stat tile on the GOOGL overview), the explanation currently lands in the chat panel as a normal answer. Instead, show it in a small tooltip/popover ("mind" bubble) anchored to the clicked element:

- appears next to the element it explains,
- has a close button (X) so the user can dismiss it,
- the answer does not get posted into the chat thread as text.

## Notes

- Streaming: the popover can fill in as the answer streams, or show a spinner until done.
- Only one popover open at a time is fine; clicking another element replaces it.
- Builds on task 020 (cmd+click what-is-this) and task 025 (cmd+hover select sub-elements). Same spirit as task 022: keep explanations attached to the visual, out of the chat text.

## Status
**Status:** done

Resolution: cmd+click now opens a "mind bubble" popover instead of posting to chat.
New server action explainElementAction (app/actions.ts) calls Haiku directly via
OpenRouter — no chat session — with the element kind, section, visible content and
up to 1600 chars of surrounding widget text as grounding. The popover is a single
fixed-position bubble anchored at the clicked element's viewport position, with an
uppercase kicker ("what is this stat tile?"), an X to dismiss, a "Thinking…" pulse
while loading, and markdown rendering for the answer; one at a time, a new click
replaces it. It renders at the Chat root (not inside the view wrapper), which also
makes it survive canvas switches while an answer is still streaming — the root
cause behind task 033. Verified live (web/scripts/verify-032-033-ui.mjs): popover
appears on a stat tile, carries a real answer, the chat thread gains no message,
X dismisses.
