"use client";

import { useRouter } from "next/navigation";
import type { CategorySnapshot } from "@/lib/views";
import { AskContext } from "./widgets/FollowUps";
import { MetricResult, formatValue } from "./widgets/MetricResult";
import { TickerCard } from "./HomeScreen";

// The body of /category/[slug]: aggregates, member cards, and a cross-member
// metric comparison. Interactive affordances (ticker buttons, follow-up chips
// inside MetricResult) route to the chat via /?ask=… — the home page turns
// that into a real question.
export function CategoryView({ data }: { data: CategorySnapshot }) {
  const router = useRouter();
  const ask = (text: string) => router.push(`/?ask=${encodeURIComponent(text)}`);
  const a = data.aggregates;
  const up = a.avgChangePct !== null && a.avgChangePct >= 0;

  const tile = (label: string, value: React.ReactNode, hint?: string) => (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {hint && <div className="text-[11px] text-neutral-400">{hint}</div>}
    </div>
  );

  return (
    <AskContext.Provider value={{ ask, busy: false }}>
      <div className="space-y-6">
        <div>
          <h1 className="text-lg font-semibold">{data.name}</h1>
          <p className="text-sm text-neutral-500">
            {a.count} covered companies · {data.blurb}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tile("Combined market cap", formatValue(a.marketCapTotal, "usd_large"))}
          {tile("Median market cap", formatValue(a.marketCapMedian, "usd_large"))}
          {tile(
            "Avg two-week move",
            a.avgChangePct === null ? "—" : (
              <span style={{ color: up ? "var(--viz-up-text)" : "var(--viz-down-text)" }}>
                {up ? "▲" : "▼"} {up ? "+" : ""}{a.avgChangePct.toFixed(1)}%
              </span>
            ),
          )}
          {tile(
            "Revenue leaders",
            <span className="text-sm leading-6">
              {a.revenueLeaders.map((l) => l.ticker).join(" · ") || "—"}
            </span>,
            a.revenueLeaders.length
              ? a.revenueLeaders.map((l) => formatValue(l.revenue, "usd_large")).join(" · ") + " TTM"
              : undefined,
          )}
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Companies</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {data.members.map((t) => (
              <TickerCard key={t.ticker} t={t} onOpen={(tk) => ask(`Give me the full overview of ${tk}`)} />
            ))}
          </div>
        </div>

        {data.metrics && (
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">Compared on the numbers</h2>
            <MetricResult data={data.metrics} />
          </div>
        )}
      </div>
    </AskContext.Provider>
  );
}
