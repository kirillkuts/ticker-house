# 014 — Per-section "chat" icon in the deep analysis

**Status:** todo

From user screenshot (arrow at the "Financial health · latest reported balance sheet" section of the company overview): each section in the deep analysis should have a "chat" icon that kicks off a focused deep-dive:

- Clicking the icon creates a NEW canvas holding only that section's stats (e.g. Financial health → cash, total debt, equity, current ratio, debt/equity history for that ticker).
- Where possible it also loads an additional distribution/decomposition view (e.g. margins section → expense breakdown; growth section → segment breakdown; valuation → peer comparison).
- The model explains the section in a user-friendly way — plain-language takeaways next to the widgets, not jargon.

Implementation notes:
- CompanyOverview.tsx `Section` component gets an optional `deepDivePrompt`; render a small chat icon button (visible on hover, like the "▦ canvas" button) in the section header that sends it through `AskContext.ask()`.
- Craft one prompt per section (headline/valuation/growth/margins/health/statements/segments), each phrased to trigger view tools (query_metrics history, show_expense_breakdown, show_segments) AND an explicit "explain what this means in plain language for a non-expert".
- New canvas comes free: canvas mode (task 007) gives every view-bearing answer its own canvas; the explanation text stays in the chat column.
- Uses the new expense/segment tools where they fit; respect their coverage caveats (NVDA/TSLA/LLY combined SG&A, JPM/BRK-B no standard expense lines, JPM no segments).

Files: web/components/widgets/CompanyOverview.tsx, possibly web/trigger/chat.ts (if prompts need a nudge in the system prompt).

Done when: hovering any deep-analysis section shows a chat icon; clicking the Financial health one yields a new canvas with health-focused widgets plus a plain-language explanation in chat.
