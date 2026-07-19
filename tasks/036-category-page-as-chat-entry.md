# 036 — Category page works as a chat entry, like the stock details view

## Task

The category page (task 031, e.g. /category/tech) is currently a static server-rendered page whose interactive bits route back to the homepage chat via /?ask=…. Make it behave like the stock details experience instead: the category itself is a chat entry point with its own chat panel and canvas.

- Opening a category starts (or resumes) a chat scoped to that category, the way tapping a company card gives the full-picture chat view for that ticker.
- The aggregate tiles, company grid, and comparison widget render as canvas views inside that chat, not as a separate static page.
- Sub-prompts and drill-down questions ("who grew fastest?", "compare margins across Tech") run in place, answering with widgets on the same canvas.
- The URL stays linkable (/category/tech), like chat URLs for companies.

## Notes

- Reuse the existing chat/canvas machinery rather than a parallel page: the category page becomes a pre-seeded chat, similar to "Give me the full overview of NVDA" for a company.
- Replaces the /?ask=… redirect hack from the task 031 implementation.

## Status
**Status:** done

Resolution: categories are now chat entries end to end. New show_category tool in
trigger/chat.ts (slug enum from CATEGORIES, returns categorySnapshot; system prompt
routes group questions to it), rendered by CategoryView — refactored from a
standalone page into a normal chat widget that consumes AskContext (tiles, member
cards, comparison table, plus drill-down chips: fastest growers / margins /
cheapest P/E over the top-8 members). /category/[slug] resumes the user's
deterministic per-category chat (chat id category-<slug>-<userId>) via loadChat, or
seeds a fresh one with a fabricated question/answer pair — the same instant-path
trick as company tiles, no model roundtrip. The URL stays canonical: the
move-to-/chat/ effect now exempts /category/ paths. Registered as a BIG view so it
auto-opens on canvas; describePart shows the category name. The /?ask=… redirect
hack from 031 is gone. Verified live (web/scripts/verify-036-ui.mjs): tile →
seeded canvas without model call, drill-down chip answers on the same canvas at
the same URL, revisit resumes the saved conversation. Also fixed while verifying:
the test's "answer finished" wait — the composer is never disabled; the Stop→Ask
button cycle is the real signal.
