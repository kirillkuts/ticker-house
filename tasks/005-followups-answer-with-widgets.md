# 005 — Follow-up chips must produce widget answers, not text

**Status:** todo

From user screenshot (chips like "Is it a good company?", "Rank peers by market cap"): some follow-up prompts lead to plain-text model answers. Every follow-up should resolve to a widget (view tool call), with text only as a short caption.

Wanted:
- Audit every hard-coded chip prompt in the widgets (FollowUps usages in CompanyOverview, MetricResult, SingleStockPrice, Fundamentals, Chat rescue chips) and rewrite prompts so they map cleanly onto a view tool (query_metrics / show_price_chart / company_overview / fundamentals). E.g. "Is it a good company?" → prompt that requests the score/metric comparison view explicitly.
- Strengthen the system prompt in web/trigger/chat.ts: when a question can be answered with a view tool, the model MUST call one; text-only answers are for coverage questions only.
- Same rule for model-generated suggest_follow_ups suggestions: description should require prompts that resolve to a view.
- Verify live: click each chip type, confirm a widget renders.

Files: web/trigger/chat.ts, web/components/widgets/*.tsx, web/components/Chat.tsx.

Done when: clicking any chip yields a rendered widget (chart/table/overview), not a paragraph.
