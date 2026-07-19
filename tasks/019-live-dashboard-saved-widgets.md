# 019 — Save widgets to a live dashboard, independent of chat

**Status:** todo

From user (screenshot: metric-comparison widget on a canvas): allow saving widgets to a live dashboard that is available separately, without a chat. Saved widgets keep their pre-prompted question chips, and clicking a chip opens a chat.

Wanted:
- A "save to dashboard" action on widgets (canvas views and inline views), next to the existing pin/remove affordances.
- A standalone `/dashboard` page listing the saved widgets — reachable from the header (both views), no chat state involved.
- LIVE data: persist the widget's recipe (tool name + input, e.g. `show_price_chart {ticker: NVDA, range: 1m}`), not the frozen output. The dashboard page re-runs the view functions server-side on load (they're all in web/lib/views.ts / metric-query.ts), so numbers are current.
- Persistence: ClickHouse table (e.g. `dashboard_widgets`: widget_id, tool, input JSON, added_at, ReplacingMergeTree) following lib/chats.ts patterns; save/remove via server actions. No auth — single shared dashboard is fine.
- Chips on saved widgets still render (FollowUps). Clicking one starts a NEW chat seeded with that question: navigate to `/` and send, or mint a chat id, send the prompt, and land on /chat/<id>. AskContext must be provided on the dashboard page with that behavior.
- Remove-from-dashboard affordance per widget.

Files: new web/app/dashboard/page.tsx, new web/lib/dashboard.ts, web/app/actions.ts, web/components/Chat.tsx (save affordance on views), web/components/Header.tsx (Dashboard link), widgets' FollowUps context.

Done when: saving the NVDA/GOOGL comparison from a canvas makes it appear at /dashboard with fresh data on every load, chips under it start a new chat, and it can be removed from the dashboard.
