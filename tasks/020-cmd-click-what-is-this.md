# 020 — Cmd+click a canvas widget asks "what is this?" on Haiku

**Status:** done

Resolution: holding Cmd puts canvas widgets in explain mode — blue ring, help cursor, tooltip "Cmd+click: explain this view". Cmd+click (capture phase, skipped when the target is a button/link/input or while streaming) sends "What is this view showing? Explain it in plain language for a non-expert..." naming the view by its refKey + describePart description (the same ids the [canvas] block uses) and stating it's already on the canvas so it must not be re-rendered. Runs with fast:true (Haiku). Meta state clears on keyup/window blur. Canvas panel only for now, per the task. Typecheck passes; the view-first prompt fix in task 021 explicitly allows this explain-only case.

From user: "I want to be able to hover over artifact with cmd button pressed, when clicked it asks a question with haiku 'what is this' giving the context that it's coming from canvas".

Wanted:
- While hovering a widget on the canvas with Cmd (meta key) held, show an affordance (e.g. cursor change / subtle outline / "?" badge) signaling explain-mode.
- Cmd+click sends a fast (Haiku, task 013 metadata `{ speed: "fast" }`) question like: "What is this view showing? Explain it in plain language for a non-expert." with context identifying the view — reuse `describePart` (and the view's `refKey`) the way the [canvas] block does, e.g. "Referring to the canvas view: <refKey> — <describePart(part)>".
- The answer is an explanation, so text-only is acceptable here despite the view-first rule — the prompt should say the view is already on the canvas and must not be re-rendered.
- Implement on the canvas panel first (each rendered view wrapper in Chat.tsx); consider the same for inline widgets later.
- Guard: don't trigger on cmd+click of interactive elements inside widgets (chips, buttons, links) — check the event target, and only in explain-mode (metaKey held).

Files: web/components/Chat.tsx (canvas view wrapper: hover + metaKey state, click handler), possibly web/trigger/chat.ts if the prompt needs a nudge.

Done when: holding Cmd over a canvas widget shows the affordance, clicking sends the "what is this" question with the view's description as context, and a fast plain-language explanation appears in chat without duplicating the widget.
