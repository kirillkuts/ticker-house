# 009 — Company tile click renders the overview canvas instantly

**Status:** todo

From user: "i want initial click on the company tile to go straight to canvas bypassing latency of the ai agent making a call (since I already know what the call will be)".

Today a tile click sends "Give me the full overview of X" through the Trigger.dev agent; the overview widget only appears after the agent boots, calls show_company_overview, and streams back. The data query itself (`companyOverview(ticker)` in web/lib/views.ts) is fast and deterministic — the agent roundtrip is pure latency.

Wanted:
- Clicking a covered-company tile fetches `companyOverview(ticker)` directly (server action) and immediately shows the chat view with the overview on a canvas — no agent in the loop.
- The conversation must stay coherent afterwards: inject the exchange as a synthetic user message ("Give me the full overview of X") + assistant message carrying a `tool-show_company_overview` part with the fetched output (via useChat `setMessages`), so the existing canvas grouping, persistence (task 002), and [canvas] block all work unchanged.
- Known tradeoff to note in code: the server-side agent history won't contain this exchange; the [canvas] block on the next question is what tells the model what's on screen. Optionally skip suggest_follow_ups chips for the synthetic answer (widgets carry their own chips).

Files: web/components/Chat.tsx (or HomeScreen), web/app/actions.ts (new server action wrapping companyOverview), web/lib/views.ts.

Done when: clicking a tile shows the overview canvas near-instantly (single ClickHouse roundtrip), the URL becomes /chat/<id>, the chat persists/restores, and a follow-up question to the agent still works in the same chat.
