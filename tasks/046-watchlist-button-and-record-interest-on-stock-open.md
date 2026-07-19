# 046 — Watchlist button on stock details view + record interest on open

**Status:** done

## Task

Two hooks into the watchlist/interest system (built in 043-pg-watchlist-and-interest-tracking, chat tools in 044, UI in 045):

1. **Watchlist button.** Whenever a stock details view is visible (company overview widget on canvas, or the details page), show an add-to-watchlist button for that ticker. Toggles: added state shows as filled/active and removes on click (removeFromWatchlist).
2. **Record interest on open.** Every time a stock is opened (overview widget rendered, company chat entered, ticker card tapped), call recordInterest for that symbol so the interest ranking reflects views, not just explicit actions.

## Notes

- Use the existing addToWatchlist/removeFromWatchlist/recordInterest from web/lib/watchlist.ts; recordInterest never throws into the caller, so fire-and-forget is fine.
- Debounce interest recording per session per ticker (one event per open, not one per re-render).
- Coordinate with task 045 (watchlist star UI) — this may extend it to the details view placement rather than duplicate it.
