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
      {/* Light/dark toggle glyph (task 064): a sun (outline circle + rays)
          with a moon (filled circle) overlapping it. */}
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden className="shrink-0">
        <path
          d="M8 2.5V3.8M8 12.2V13.5M2.5 8H3.8M12.2 8H13.5M4.11 4.11l.92.92M11.89 11.89l-.92-.92M4.11 11.89l.92-.92"
          strokeLinecap="round"
        />
        <circle cx="8" cy="8" r="3.3" />
        <circle cx="9.3" cy="6.7" r="2.4" fill="currentColor" stroke="none" />
      </svg>
      {/* Label matches the sibling header buttons; collapses to icon-only
          when the header is tight, like Dashboard/Briefing (task 056). */}
      <span className="hidden @lg:inline">Theme</span>
    </button>
  );
}
