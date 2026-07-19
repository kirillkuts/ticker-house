# 016 — Chats dropdown renders outside the viewport

**Status:** todo

From user screenshot (arrow at the open "Chats" dropdown): the dropdown panel is anchored `right-0` to the Chats button, but the button sits near the LEFT edge of the window (next to the brand), so the 18rem-wide panel extends left past the viewport edge — chat titles are clipped at the window boundary ("the full overview of MS…" rows cut off).

Wanted:
- The dropdown must always stay fully inside the viewport. Simple fix: anchor `left-0` when the trigger is in the left half (or just switch the panel to `left-0` since the button now lives next to the brand on the left); a robust fix clamps against both edges.
- Check it in all three placements: home header, chat view without canvas, chat view with canvas open (narrow column).
- Related: task 015 may move these buttons; coordinate — if the actions move to the right side of the header, `right-0` becomes correct again. Fix positioning so it works wherever the button ends up.

Files: web/components/ChatHistory.tsx (dropdown positioning).

Done when: opening Chats in any view keeps the full panel (titles + timestamps) visible inside the window.
