"use client";

import { useContext } from "react";
import type { CategorySnapshot } from "@/lib/views";
import { AskContext, FollowUps } from "./widgets/FollowUps";
import { MetricResult, formatValue } from "./widgets/MetricResult";
import { TickerCard } from "./HomeScreen";

// The category dashboard, rendered as a chat view (show_category tool output).
// Interactive affordances go through the surrounding chat's AskContext like
// every other widget; without a provider they hide themselves.
export function CategoryView({ data }: { data: CategorySnapshot }) {
  const { ask } = useContext(AskContext);
  const a = data.aggregates;
  const up = a.avgChangePct !== null && a.avgChangePct >= 0;
  const topTickers = (data.metrics?.rows ?? []).slice(0, 8).map((r) => String(r.ticker));

  const tile = (label: string, value: React.ReactNode, hint?: string) => (
    <div data-explain="stat tile" className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {hint && <div className="text-[11px] text-neutral-400">{hint}</div>}
    </div>
  );

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 my-2 space-y-5">
      <div>
        <h3 className="text-lg font-semibold leading-tight">{data.name}</h3>
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

      <FollowUps
        asks={[
          { label: "Fastest growers", prompt: `Rank these ${data.name} companies by revenue growth YoY: ${topTickers.join(", ")}` },
          { label: "Margin comparison", prompt: `Compare net margins for ${topTickers.slice(0, 6).join(", ")}` },
          { label: "Cheapest on P/E", prompt: `Rank these ${data.name} companies by P/E, cheapest first: ${topTickers.join(", ")}` },
        ]}
      />

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Companies</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {data.members.map((t) => (
            <TickerCard key={t.ticker} t={t} onOpen={(tk) => ask?.(`Give me the full overview of ${tk}`, { fast: true })} />
          ))}
        </div>
      </div>

      {data.metrics && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Compared on the numbers</h3>
          <MetricResult data={data.metrics} />
        </div>
      )}
    </div>
  );
}
