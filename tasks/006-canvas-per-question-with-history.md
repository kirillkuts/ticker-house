# 006 — One canvas per question, with a canvas history switcher

**Status:** done

Resolution: canvas state in Chat.tsx is now derived — one CanvasGroup per assistant message that qualifies (2+ views, a big view, or user-pinned views), labeled by the triggering question (lead tickers as fallback). Switching reads existing message parts, never refetches; restored chats rebuild their full canvas history. New answers auto-focus the newest canvas (only when it's new or gains views, so removing a view doesn't yank the canvas open). A pill-tab switcher appears in the canvas header when 2+ canvases exist. clear/remove apply to the current canvas only via a removedKeys overlay; manual pins and edit_canvas add_new_views go through a pinnedKeys overlay. Verified: typecheck clean, seeded two-answer chat renders. Worth a live click-through of three visual questions to see three switchable canvases.

From user screenshot: canvas currently accumulates views from the whole chat ("Canvas · MSFT 1 view", clear/remove buttons). Wanted model:

- Each new user question that produces any visualization creates a NEW canvas holding that answer's views. It replaces the visible canvas.
- Previous canvases stay available: add a history switcher in the canvas header (e.g. tabs or a dropdown/back-forward: "MSFT overview", "MSFT vs GOOGL", ...), labeled by the question or lead ticker.
- Switching canvases doesn't refetch — views are already in message parts; group view parts by the user message that triggered them.
- "clear" / per-view "remove" can go or apply to the current canvas only.

Files: web/components/Chat.tsx (canvas state: currently a flat list of ViewRefs).

Done when: asking three visual questions yields three switchable canvases, newest shown by default.
