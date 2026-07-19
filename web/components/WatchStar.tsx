"use client";

import { useWatchlist, toggleWatch } from "./watchStore";

// One-click watchlist toggle. Renders nothing until the watchlist is known,
// so the star never flashes from unstarred to starred on load. A <span> with
// a role, not a <button>: it lives inside clickable tiles where nesting
// buttons is invalid HTML.
export function WatchStar({ symbol, className = "" }: { symbol: string; className?: string }) {
  const watching = useWatchlist();
  if (watching === null) return null;
  const sym = symbol.toUpperCase();
  const watched = watching.has(sym);
  return (
    <span
      role="button"
      tabIndex={0}
      aria-pressed={watched}
      title={watched ? `Stop watching ${sym}` : `Watch ${sym}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleWatch(sym);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          toggleWatch(sym);
        }
      }}
      className={`cursor-pointer select-none text-sm leading-none transition-colors ${
        watched ? "text-amber-500 hover:text-amber-600" : "text-neutral-300 hover:text-amber-500 dark:text-neutral-600"
      } ${className}`}
    >
      {watched ? "★" : "☆"}
    </span>
  );
}
