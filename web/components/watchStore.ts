"use client";

import { useEffect, useSyncExternalStore } from "react";
import { toggleWatchlistAction, watchlistSymbolsAction } from "@/app/actions";

// Shared client-side view of the user's watchlist, so the home-tile stars,
// the overview-header star and the Watching section all flip together on one
// toggle. The Set is immutable (replaced on change); null means "not loaded
// yet" — consumers render no star until the truth arrives (seed or fetch).

let current: Set<string> | null = null;
let loading = false;
let listeners: (() => void)[] = [];
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
};

// Home already knows the watchlist server-side; seeding skips the fetch.
export function seedWatchlist(symbols: string[]) {
  if (current !== null) return;
  current = new Set(symbols.map((s) => s.toUpperCase()));
  emit();
}

function ensureLoaded() {
  if (current !== null || loading) return;
  loading = true;
  watchlistSymbolsAction()
    .then((symbols) => {
      current ??= new Set(symbols.map((s) => s.toUpperCase()));
      emit();
    })
    .catch(() => {
      loading = false; // a later mount retries
    });
}

export function useWatchlist(): Set<string> | null {
  useEffect(ensureLoaded, []);
  return useSyncExternalStore(subscribe, () => current, () => null);
}

// Optimistic: flip locally first, revert if the server action fails.
// addToWatchlist/removeFromWatchlist record the interest events themselves.
export function toggleWatch(symbol: string) {
  const sym = symbol.toUpperCase();
  const had = current?.has(sym) ?? false;
  const next = new Set(current ?? []);
  if (had) next.delete(sym);
  else next.add(sym);
  current = next;
  emit();
  toggleWatchlistAction(sym, !had).catch(() => {
    const revert = new Set(current ?? []);
    if (had) revert.add(sym);
    else revert.delete(sym);
    current = revert;
    emit();
  });
}
