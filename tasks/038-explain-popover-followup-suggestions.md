# 038 — Explain popover suggests follow-up steps

## Task

The "what is this?" popover (task 032) ends at the explanation. Where it makes sense, it should also offer follow-up steps: 1–2 small clickable chips under the answer, like the sub-prompt chips widgets already have.

Example from the screenshot: explaining the ACN revenue-by-segment chart could suggest "Which segment grew fastest?" or "Compare segment margins".

## Behavior

- The explain response includes optional follow-up suggestions relevant to the explained element.
- They render as chips at the bottom of the popover; clicking one asks that question through the normal chat flow (answer as a widget on canvas) and closes the popover.
- "Where applicable" — if nothing useful, the model returns none and the popover shows just the answer.

## Notes

- explainElementAction needs structured output (answer + suggestions[]) instead of plain text; keep the shorter formatting from task 034.
- Reuse the existing sub-prompt chip component and ask flow.

## Status
**Status:** done

Resolution: explainElementAction now returns structured output via generateObject
({answer, suggestions[]}), keeping the task-034 short/bulleted format. Up to two
suggestions render as chips under the popover answer (same pill styling as widget
sub-prompts); clicking one closes the popover and sends the prompt through the
normal chat ask flow (fast model), answering with a widget on canvas. When the
model returns none, the popover shows just the answer. Gotcha found: OpenRouter's
Azure-hosted Claude rejects maxItems/maxLength in structured-output schemas — zod
length constraints dropped and clamped in code instead. Verified live
(web/scripts/verify-038-ui.mjs): 2 chips rendered under a stat-tile explanation,
click closed the popover and the question entered the chat flow.
