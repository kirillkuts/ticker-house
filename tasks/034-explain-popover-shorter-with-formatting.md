# 034 — Explain popover: shorter answers, bullets, formatting

## Task

The "what is this?" popover (task 032) currently returns one long paragraph (see the Diluted EPS example: ~8 dense lines). Make the answers:

- **Shorter** — a couple of sentences of substance, not an essay.
- **Bulleted** — use bullet points where the content is a list (what it measures, how it's computed, why it matters).
- **Formatted** — bold the key term/number, keep the markdown rendering the popover already has, applied where it helps.

## Notes

- This is mostly prompt work in explainElementAction: instruct the model to answer in ≤3 short bullets or 2 sentences, bold the defined term, no filler.
- Keep the plain-language style; just tighter and scannable.
- Check the popover's CSS renders lists cleanly (spacing, indent) since answers were paragraph-only so far.

## Status
**Status:** done

Resolution: explainElementAction system prompt rewritten — at most 3 one-sentence
bullets (or 2 plain sentences), under 60 words, bold the defined term and key
number, no intro/filler. The popover already renders markdown via prose-chat
(disc lists + indent from globals.css), so bullets and bold display cleanly.
Verified live: legend-entry answer came back at 286 chars as two bullets with
**Americas Segment** and **$35.1B** bolded (web/scripts/verify-034-035-037-ui.mjs
+ screenshot).
