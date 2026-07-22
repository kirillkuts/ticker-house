"use client";

import { useSyncExternalStore } from "react";

// Experimental theme switch: default (follows the system) ⇄ "ch", the
// ClickHouse-style dark/yellow look. The choice persists in localStorage and
// is applied before paint by the script in layout.tsx. The <html> dataset is
// the source of truth; useSyncExternalStore reads it without SSR mismatch.

let listeners: (() => void)[] = [];
const subscribe = (cb: () => void) => {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
};
const isCh = () => document.documentElement.dataset.theme === "ch";

export function ThemeToggle() {
  const ch = useSyncExternalStore(subscribe, isCh, () => false);

  const toggle = () => {
    const el = document.documentElement;
    if (el.dataset.theme === "ch") {
      delete el.dataset.theme;
      localStorage.removeItem("th-theme");
      el.dataset.mode = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } else {
      el.dataset.theme = "ch";
      el.dataset.mode = "dark";
      localStorage.setItem("th-theme", "ch");
    }
    listeners.forEach((l) => l());
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={ch ? "Back to the default theme" : "Try the dark/yellow theme"}
      aria-pressed={ch}
      className="flex items-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm text-neutral-500 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden className="shrink-0">
        <path d="M8 1.5c-3.6 0-6.5 2.9-6.5 6.5s2.9 6.5 6.5 6.5c1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8h1.9c1.7 0 3-1.3 3-3C15.5 3.4 12.1 1.5 8 1.5Z" strokeLinejoin="round" />
        <circle cx="5" cy="6" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="8.5" cy="4.5" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="11.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
      </svg>
      {/* Label matches the sibling header buttons; collapses to icon-only
          when the header is tight, like Dashboard/Briefing (task 056). */}
      <span className="hidden @lg:inline">Theme</span>
    </button>
  );
}
