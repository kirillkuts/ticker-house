"use client";

import type { HomeTicker } from "@/lib/views";
import type { RecentChat } from "@/lib/chats";
import { relativeTime } from "@/lib/format";
import { companyDisplayName } from "./widgets/CompanyOverview";

const SUGGESTIONS = [
  "Give me the full overview of NVDA",
  "How has Apple's revenue grown over the last decade?",
  "Compare net margins for MSFT, GOOGL and META",
  "Which covered stocks trade under 30x earnings?",
  "Rank everyone by return on equity",
  "TSLA price action this month",
];

// 12-point stat-tile sparkline: de-emphasis line, accent dot on the current
// value. Sized via viewBox so it scales down inside narrow cards instead of
// overflowing; a single close renders as just the dot.
function Sparkline({ closes }: { closes: number[] }) {
  const w = 64;
  const h = 20;
  const pad = 3;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const pts = closes.map((c, i) => ({
    x: closes.length === 1 ? w - pad : pad + (i / (closes.length - 1)) * (w - 2 * pad),
    y: pad + (1 - (c - min) / span) * (h - 2 * pad),
  }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const end = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} aria-hidden className="h-5 w-16 min-w-0">
      {pts.length > 1 && (
        <path d={path} fill="none" stroke="var(--viz-muted)" strokeWidth={1.5}
              strokeLinecap="round" strokeLinejoin="round" />
      )}
      <circle cx={end.x} cy={end.y} r={2.5} fill="var(--viz-1)" />
    </svg>
  );
}

function TickerCard({ t, onOpen }: { t: HomeTicker; onOpen: (ticker: string) => void }) {
  const up = t.changePct !== null && t.changePct >= 0;
  const singleDay = t.changePct === null;
  return (
    <button
      type="button"
      onClick={() => onOpen(t.ticker)}
      title={
        singleDay
          ? `Open the full ${t.ticker} overview · only one day of price history so far`
          : `Open the full ${t.ticker} overview`
      }
      className="group overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 text-left transition-colors hover:border-blue-400 dark:hover:border-blue-500"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold whitespace-nowrap">{t.ticker}</span>
        {singleDay ? (
          <span className="text-[10px] uppercase tracking-wide text-neutral-400 whitespace-nowrap">1 day</span>
        ) : (
          <span
            className="text-xs font-medium whitespace-nowrap"
            style={{ color: up ? "var(--viz-up-text)" : "var(--viz-down-text)" }}
          >
            {up ? "▲" : "▼"} {up ? "+" : ""}{t.changePct!.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="truncate text-xs text-neutral-500">{companyDisplayName(t.companyName)}</div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="text-sm font-medium tabular-nums whitespace-nowrap">${t.lastClose.toFixed(2)}</span>
        {t.closes.length >= 1 && <Sparkline closes={t.closes} />}
      </div>
    </button>
  );
}

export function HomeScreen({
  home,
  recent = [],
  onAsk,
  onTickerTile,
  composer,
}: {
  home: HomeTicker[];
  recent?: RecentChat[];
  onAsk: (text: string) => void;
  // Instant path for company tiles; falls back to asking the agent.
  onTickerTile?: (ticker: string) => void;
  composer: React.ReactNode;
}) {
  const openTile = onTickerTile ?? ((tk: string) => onAsk(`Give me the full overview of ${tk}`));
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
          Ask about a stock.
          <br />
          Get an interactive answer.
        </h1>
        <p className="max-w-md text-sm text-neutral-500">
          Questions become live dashboards — real prices and SEC fundamentals,
          never made-up numbers.
        </p>
      </div>

      <div className="space-y-3">
        {composer}
        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onAsk(s)}
              className="rounded-full border border-neutral-200 dark:border-neutral-800 px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-300 transition-colors hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {recent.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Recent chats</h2>
          <div className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800">
            {recent.map((c) => (
              <a
                key={c.chatId}
                href={`/chat/${c.chatId}`}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <span className="truncate">{c.title || "Untitled chat"}</span>
                <span className="shrink-0 text-xs text-neutral-400">{relativeTime(c.updatedAt)}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {home.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Covered companies</h2>
            <span className="text-xs text-neutral-500">last two weeks · tap one for the full picture</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {home.map((t) => (
              <TickerCard key={t.ticker} t={t} onOpen={openTile} />
            ))}
          </div>
          <p className="text-center text-[11px] text-neutral-400">
            {home.length} large caps · SEC fundamentals back to 2008
          </p>
        </div>
      )}
    </div>
  );
}
