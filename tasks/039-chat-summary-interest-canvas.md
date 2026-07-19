# 039 — Chat summary button: interest-driven final canvas

## Task

Add a "summarize" button to a chat. Not a text recap. The flow:

1. **Analyze interest signals** from the whole session:
   - which questions the user typed,
   - which follow-up / sub-prompt chips they clicked (vs ignored),
   - which elements they cmd+clicked to explain,
   - which views they saved, kept open, or revisited; which they removed.
2. **Infer themes** — e.g. "user kept drilling into GOOGL margins and segment mix, ignored valuation".
3. **Build a final canvas**: one composed view with the widgets/facts the user showed interest in — the relevant charts, stat tiles, and comparisons, arranged as a digest of the session. Explanatory notes attach to the visuals (task 022 / 029 style), not as a wall of text.

## Notes

- Interest signals need to be recorded: chip clicks and explain-clicks likely aren't persisted in chat history today — check and add event logging if missing.
- The final canvas should be pinnable/saveable to the dashboard (task 019), so a session ends as a durable artifact.
- Placement: button in the chat header, near the existing canvas controls.

## Status
**Status:** done

Resolution: interest signals are recorded client-side per session — typed
questions and chip clicks in ask() (distinguished by the fast flag), cmd+click
explains (element kind + snippet), dashboard saves, and canvas removals with the
view's description. The new "✦ summarize" button in the canvas header sends the
signal log plus the list of produced views (id + description) to
summarizeInterestAction (Sonnet, structured output): it returns a title, a short
markdown note, and 2-5 picked view ids weighted by the signals (removals count
against). The client composes a local exchange — "Summarize this session for me" +
an assistant message holding the note and COPIES of the picked view parts — which
becomes the newest canvas: pinnable per widget to the live dashboard (recipes ride
along via part.input) and persisted with the chat, so it survives reload and
resumes like any other exchange. Verified live (web/scripts/verify-039-ui.mjs):
seeded category + comparison ask + explain-click → digest tab appears, picked view
on canvas with save buttons, note in chat, persists across reload; the model's
pick correctly favored the typed-question view over the generic category view.
v1 caveats: explain/save/remove signals are in-memory per session (typed/chip
questions persist via messages), and the digest note renders in the chat next to
the canvas rather than as per-visual annotations.
