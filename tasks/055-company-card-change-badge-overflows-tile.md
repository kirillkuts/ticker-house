# 055 — Company card's change badge overflows the tile onto the next card

**Status:** done

Fixed in `web/components/HomeScreen.tsx`. Same fix as task 054: the ticker span now `min-w-0` with the ticker text in an inner `truncate` span, while the star and the change badge are `shrink-0`. The badge can no longer be pushed out or clipped — it always keeps its place inside the card and the ticker ellipsizes first. Applied to both `TickerCard` (covered companies) and `PriceOnlyCard` (watchlist price-only tiles), which shared the identical row. Verified at 900px/5-column layout: every badge sits inside its card with right padding, none overflow onto a neighbor.

## Bug

On the homepage "Covered companies" grid, the ▲/▼ change badge next to the ticker spills outside the right edge of the card when the ticker or percentage is wide:

- WMT: "▲ +5.0%" renders outside the tile, over the gap toward the AAPL card (red arrow in the screenshot).
- AAPL "▲ +13.4…", MSFT "▲ +2.5…", NVDA "▲ +2.6…" are clipped at the card's right edge.

## Expected

The ticker and its change badge always fit inside the card. The badge must never render outside its own tile or overlap the neighboring card.

## Notes

- Same class of bug as task 054 (category tiles). The header row is ticker + star + change badge; when combined width exceeds the card, the badge overflows instead of the row shrinking/truncating.
- Fix the row layout so it stays within the card: truncate the ticker/name if needed, or let the badge wrap, and keep the badge inside the padding.

## Steps to reproduce

Open the homepage; look at the "Covered companies" card grid, "Top revenue" sort.
