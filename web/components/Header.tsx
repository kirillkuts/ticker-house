import { signOutAction } from "@/app/actions";
import { ThemeToggle } from "./ThemeToggle";

// The one brand treatment used everywhere: logo + wordmark on the left
// (always a link home), contextual actions on the right.
function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <rect x="1" y="1" width="26" height="26" rx="7" fill="var(--viz-1)" opacity="0.12" />
      <rect x="6" y="14" width="3.5" height="8" rx="1.5" fill="var(--viz-1)" />
      <rect x="12.25" y="9" width="3.5" height="13" rx="1.5" fill="var(--viz-1)" />
      <rect x="18.5" y="5" width="3.5" height="17" rx="1.5" fill="var(--viz-1)" />
    </svg>
  );
}

// The header is a CSS container: the chat column's width changes with the
// canvas divider, so the wordmark and action labels collapse on container
// width (viewport breakpoints would lie here). Below @sm only the logo
// carries the brand; action buttons show their labels from @lg up.
export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="@container flex items-center justify-between gap-2">
      <a href="/" className="flex shrink-0 items-center gap-2.5" title="TickerHouse home">
        <Logo />
        <span className="hidden text-lg font-semibold tracking-tight @sm:inline">TickerHouse</span>
      </a>
      <div className="flex items-center gap-2">
        <a
          href="/dashboard"
          title="Live dashboard of saved widgets"
          className="flex items-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm text-neutral-500 hover:border-blue-400 hover:text-blue-600"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden className="shrink-0">
            <rect x="2" y="2" width="5" height="5" rx="1" />
            <rect x="9" y="2" width="5" height="5" rx="1" />
            <rect x="2" y="9" width="5" height="5" rx="1" />
            <rect x="9" y="9" width="5" height="5" rx="1" />
          </svg>
          <span className="hidden @lg:inline">Dashboard</span>
        </a>
        <a
          href="/briefing"
          title="Daily watchlist briefing"
          className="flex items-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm text-neutral-500 hover:border-blue-400 hover:text-blue-600"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden className="shrink-0">
            <path d="M3 2.5h10v11H3z" />
            <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
          </svg>
          <span className="hidden @lg:inline">Briefing</span>
        </a>
        {children}
        <ThemeToggle />
        <form action={signOutAction}>
          <button
            type="submit"
            title="Sign out"
            className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-sm text-neutral-500 hover:border-red-400 hover:text-red-500"
          >
            <span className="hidden @lg:inline">Sign out</span>
            <span className="@lg:hidden" aria-hidden>⎋</span>
          </button>
        </form>
      </div>
    </header>
  );
}
