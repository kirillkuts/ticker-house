# 001 — Fix homepage company cards

**Status:** done

Resolution: sparkline now scales via viewBox + min-w-0 and the card clips overflow. META genuinely has one real price row (its other rows are the unrelated "FB" symbol, correctly dropped by sanePriceRows), so it renders a single-dot sparkline with a muted "1 day" badge instead of "—". Added companyDisplayName (strips legal suffixes, fixes JPMorgan/NVIDIA/Amazon.com casing) used by the cards. Verified live: all 10 cards render, names clean, typecheck passes.

From user screenshot (red arrow at JPM card, homepage "Covered companies" grid):

- Sparklines overflow the card: the line and its end dot spill past the card's right border (JPM, AAPL, NVDA, MSFT, AMZN, GOOGL, BRK-B, LLY, TSLA all show it). Clip the sparkline inside the card padding.
- META card has no sparkline and shows "—" for change while other cards show a % move. Investigate why META has no price series here (likely the FB/META symbol collision, see sanePriceRows in web/lib/views.ts) and either render its sparkline or show a proper fallback.
- Company names truncate awkwardly ("Jpmorgan Chase...", "Berkshire Hatha...", "Meta Platforms, I..."). Improve truncation/casing.

Files: web/components/HomeScreen.tsx, web/lib/views.ts (homepage data query).

Done when: homepage cards render sparklines fully inside card bounds, META shows a real sparkline + change %, names look clean.
