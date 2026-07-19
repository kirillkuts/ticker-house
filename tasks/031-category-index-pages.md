# 031 — Category / index pages with homepage entry points

## Task

Add a category page, in the same spirit as the company details page but for a group of stocks: tech companies, aviation companies, energy, banks, and so on (sectors/industries, or an index-like grouping).

Two parts:

1. **Category page.** A rich page for one category:
   - list of covered companies in the category (cards like the homepage grid),
   - aggregate stats: total/median market cap, average two-week move, revenue leaders,
   - comparison widgets: revenue, net margin, P/E across the category members,
   - each company card links to its details page.
2. **Homepage entry points.** A row/section of category tiles on the home page ("Tech", "Aviation", "Energy", …) that open the category page.

## Notes

- Categories can come from the sector/industry field already shown on the overview widget (e.g. "Semiconductors & Related Devices" for NVDA); group covered companies by it, possibly with a curated coarser mapping so tiles read "Tech" not "Prepackaged Software".
- Category pages should have URLs so they're linkable, like company pages.
- Watch the daily_prices symbol collision issue when aggregating (see memory: FB rows aren't Meta).

## Status
**Status:** done

Resolution: 8 curated categories (Tech, Healthcare, Financials, Consumer & Media,
Industrials, Aerospace & Defense, Energy, Utilities & Telecom) in lib/categories.ts,
keyed by the exact SEC industry strings in `securities` plus a ticker override for
MRSH (blank industry). HomeTicker now carries industry; /category/[slug] (login-gated,
linkable, 404 on unknown slug) shows aggregate tiles (combined + median market cap,
avg two-week move, top-3 revenue leaders by TTM), the member card grid (reused
TickerCard), and a cross-member comparison rendered by the existing MetricResult
widget (market cap, P/E, net margin, revenue, growth — sorted by market cap).
Interactive affordances route to chat via /?ask=… through an AskContext provider.
Homepage gains a "Browse by category" tile row (name, member count, avg move) above
the companies grid. Aggregation reuses homeSnapshot, so the daily_prices symbol
collision guard (sanePriceRows) applies. Verified: data sweep (all ~100 covered
companies map to a category, every category ≥2 members, tech snapshot sane —
web/scripts/verify-031.ts) and Playwright flow (tiles → tech page renders
aggregates/cards/comparison, card click routes to the overview chat, unknown slug
404s — web/scripts/verify-031-ui.mjs) with screenshots eyeballed.
