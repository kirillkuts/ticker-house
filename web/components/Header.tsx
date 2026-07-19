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

export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between">
      <a href="/" className="flex items-center gap-2.5" title="Ticker House home">
        <Logo />
        <span className="text-lg font-semibold tracking-tight">Ticker House</span>
      </a>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  );
}
