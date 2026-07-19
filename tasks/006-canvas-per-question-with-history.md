# 006 — One canvas per question, with a canvas history switcher

**Status:** todo

From user screenshot: canvas currently accumulates views from the whole chat ("Canvas · MSFT 1 view", clear/remove buttons). Wanted model:

- Each new user question that produces any visualization creates a NEW canvas holding that answer's views. It replaces the visible canvas.
- Previous canvases stay available: add a history switcher in the canvas header (e.g. tabs or a dropdown/back-forward: "MSFT overview", "MSFT vs GOOGL", ...), labeled by the question or lead ticker.
- Switching canvases doesn't refetch — views are already in message parts; group view parts by the user message that triggered them.
- "clear" / per-view "remove" can go or apply to the current canvas only.

Files: web/components/Chat.tsx (canvas state: currently a flat list of ViewRefs).

Done when: asking three visual questions yields three switchable canvases, newest shown by default.
