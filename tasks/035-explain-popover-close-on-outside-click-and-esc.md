# 035 — Explain popover closes on outside click and Escape

## Task

The "what is this?" popover (task 032) currently closes only via its X button. Add:

- **Click outside** the popover closes it.
- **Escape** closes it while it's open.

## Notes

- A cmd+click on another explain target should still open the new popover, not just dismiss the old one (don't let the outside-click handler swallow it).
- Clean up the document-level listeners on unmount/close.
- Don't close on clicks inside the popover (e.g. selecting text).

## Status
**Status:** done

Resolution: while the popover is open, document-level listeners close it on
Escape and on pointerdown outside [data-explain-popover]; pointerdown (not
click) means a cmd+click on another explain target closes the old popover first
and its own click-capture handler then opens the new one. Clicks inside the
popover (text selection, the X) are untouched. Listeners attach only while a
popover is open and are removed on close/unmount (single effect keyed on
presence). Verified live: Escape closes, inside-click keeps open, outside click
closes, cmd+click on another target replaces (web/scripts/verify-034-035-037-ui.mjs).
