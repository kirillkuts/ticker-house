"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, BarChart, Cell,
} from "recharts";
import type { SingleStockPriceData } from "@/lib/views";
import { FollowUps } from "./FollowUps";
import { titleCase } from "./CompanyOverview";

function fmtVol(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return `${Math.round(v / 1e3)}K`;
}

const TOOLTIP_STYLE = {
  background: "var(--tooltip-bg)",
  border: "1px solid var(--tooltip-border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground)",
};

function Kpi({ label, value, accent }: { label: string; value: string; accent?: "up" | "down" }) {
  const color = accent === "up" ? "var(--viz-up-text)" : accent === "down" ? "var(--viz-down-text)" : undefined;
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 text-center">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg font-semibold" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}

export function SingleStockPrice({ data }: { data: SingleStockPriceData }) {
  const up = data.kpis.changePct >= 0;
  const points = data.prices.map((p) => ({
    ...p,
    label: p.date.slice(5),
    up: p.close >= p.open,
  }));

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 my-2 space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <span className="font-semibold">{titleCase(data.companyName)}</span>{" "}
          <span className="text-neutral-500 text-sm">{data.ticker} · {data.industry || data.sector}</span>
        </div>
        <div className="font-semibold" style={{ color: up ? "var(--viz-up-text)" : "var(--viz-down-text)" }}>
          ${data.kpis.lastClose.toFixed(2)} ({up ? "+" : ""}{data.kpis.changePct.toFixed(2)}%)
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={points}>
          <XAxis dataKey="label" fontSize={11} tick={{ fill: "var(--viz-muted)" }} axisLine={{ stroke: "var(--viz-axis)" }} tickLine={false} />
          <YAxis domain={["auto", "auto"]} fontSize={11} width={55} tick={{ fill: "var(--viz-muted)" }} axisLine={false} tickLine={false}
                 tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `$${Number(v).toFixed(2)}`} />
          <Line isAnimationActive={false} type="monotone" dataKey="close" stroke="var(--viz-1)" dot={false} strokeWidth={2} />
          <Line isAnimationActive={false} type="monotone" dataKey="high" stroke="var(--viz-muted)" dot={false} strokeDasharray="3 3" strokeWidth={1} />
          <Line isAnimationActive={false} type="monotone" dataKey="low" stroke="var(--viz-muted)" dot={false} strokeDasharray="3 3" strokeWidth={1} />
        </ComposedChart>
      </ResponsiveContainer>

      <ResponsiveContainer width="100%" height={80}>
        <BarChart data={points}>
          <XAxis dataKey="label" fontSize={11} hide />
          <YAxis fontSize={10} width={55} tick={{ fill: "var(--viz-muted)" }} axisLine={false} tickLine={false} tickFormatter={fmtVol} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmtVol(Number(v))} />
          <Bar isAnimationActive={false} dataKey="volume">
            {points.map((p, i) => (
              <Cell key={i} fill={p.up ? "var(--viz-good)" : "var(--viz-bad)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-4 gap-2">
        <Kpi label={`${data.range} High`} value={`$${data.kpis.high.toFixed(2)}`} />
        <Kpi label={`${data.range} Low`} value={`$${data.kpis.low.toFixed(2)}`} />
        <Kpi label="Avg Volume" value={fmtVol(data.kpis.avgVolume)} />
        <Kpi label={`${data.range} Change`} value={`${up ? "+" : ""}${data.kpis.changePct.toFixed(2)}%`}
             accent={up ? "up" : "down"} />
      </div>
      <FollowUps
        asks={
          data.hasFundamentals
            ? [
                { label: "Full company overview", prompt: `Give me the full overview of ${data.ticker}` },
                { label: "Fundamentals", prompt: `Show ${data.ticker}'s annual fundamentals` },
                { label: "Is the price justified?", prompt: `Is ${data.ticker}'s current price justified by its earnings? Compare its P/E with the covered stocks` },
              ]
            : [
                // No fundamentals for this ticker — only offer what works.
                data.range === "7d"
                  ? { label: "1-month view", prompt: `Show ${data.ticker}'s price chart for the last month` }
                  : { label: "7-day view", prompt: `Show ${data.ticker}'s price chart for the last 7 days` },
                { label: "What's covered?", prompt: "Which companies do you cover with full fundamentals?" },
              ]
        }
      />
    </div>
  );
}
