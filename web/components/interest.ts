"use client";

import { recordStockOpenAction } from "@/app/actions";

// Fire-and-forget "the user opened this stock" recorder (task 046), debounced
// per browser session per ticker: re-renders and repeat visits within a tab
// don't stack events. sessionStorage keeps the seen-set across navigations;
// where it's unavailable the module-level set still guards this page load.

const KEY = "interestOpens";
const seenThisLoad = new Set<string>();

export function recordOpen(symbol: string, source: string) {
  const sym = symbol.toUpperCase();
  if (seenThisLoad.has(sym)) return;
  seenThisLoad.add(sym);
  try {
    const stored: string[] = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    if (stored.includes(sym)) return;
    sessionStorage.setItem(KEY, JSON.stringify([...stored, sym]));
  } catch {
    // sessionStorage unavailable — the module-level set already debounced.
  }
  recordStockOpenAction(sym, source).catch(() => {});
}
