"use client";

import { useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, LabelList,
} from "recharts";
import type { MetricQueryResult, MetricColumn } from "@/lib/metric-query";
import { METRICS, type MetricKey, type Unit } from "@/lib/metric-registry";
import { titleCase } from "./CompanyOverview";
import { FollowUps, TickerButton } from "./FollowUps";

// Validated categorical slots, in fixed order (defined in globals.css).
const LINE_COLORS = [
  "var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)",
  "var(--viz-5)", "var(--viz-6)", "var(--viz-7)", "var(--viz-8)",
];

const TOOLTIP_STYLE = {
  background: "var(--tooltip-bg)",
  border: "1px solid var(--tooltip-border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground)",
};

export function formatValue(value: unknown, unit: Unit): string {
  if (value === null || value === undefined || value === "") return "—";
  const v = Number(value);
  if (!Number.isFinite(v)) return "—";
  switch (unit) {
    case "usd_large": {
      const abs = Math.abs(v);
      if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
      if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
      if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
      return `$${v.toFixed(0)}`;
    }
    case "percent": return `${v.toFixed(1)}%`;
    case "ratio": return `${v.toFixed(2)}x`;
    case "per_share": return `$${v.toFixed(2)}`;
    case "shares": {
      const abs = Math.abs(v);
      if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
      if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
      return v.toFixed(0);
    }
  }
}

type Row = MetricQueryResult["rows"][number];
type Mode = "table" | "line" | "bar" | "kpi" | "compare";

const TIP_WIDTH = 256;

// A metric label with its plain-language definition on hover. The dotted
// underline is the affordance. The tooltip is position:fixed because table
// labels live inside overflow-x-auto containers that would clip it.
export function MetricLabel({ column }: { column: MetricColumn }) {
  // Results persisted before columns carried `explain` fall back to the registry.
  const explain = column.explain ?? (METRICS[column.key as MetricKey]?.explain as string | undefined);
  const [tip, setTip] = useState<{ left: number; top: number } | null>(null);
  if (!explain) return <>{column.label}</>;
  return (
    <span
      className="cursor-help underline decoration-dotted underline-offset-2 decoration-neutral-400 dark:decoration-neutral-600"
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const left = Math.min(
          Math.max(r.left + r.width / 2 - TIP_WIDTH / 2, 8),
          window.innerWidth - TIP_WIDTH - 8,
        );
        setTip({ left, top: r.bottom + 6 });
      }}
      onMouseLeave={() => setTip(null)}
    >
      {column.label}
      {tip && (
        <span
          className="fixed z-50 rounded-lg border p-2.5 text-left text-[11px] font-normal normal-case leading-snug shadow-md pointer-events-none whitespace-normal"
          style={{
            left: tip.left, top: tip.top, width: TIP_WIDTH,
            background: "var(--tooltip-bg)", borderColor: "var(--tooltip-border)",
            color: "var(--foreground)",
          }}
        >
          {explain}
        </span>
      )}
    </span>
  );
}

function chooseDisplay(data: MetricQueryResult): Mode {
  const hint = data.spec.display;
  const isTs = data.spec.period !== "latest";
  const tickerCount = new Set(data.rows.map((r) => r.ticker)).size;

  if (hint && hint !== "auto") {
    // Ignore hints impossible for the shape: a line needs a time axis.
    if (hint === "line" && !isTs) return "table";
    if (hint === "kpi" && (isTs || tickerCount > 1)) return "table";
    // The transposed head-to-head IS the table form for a few companies.
    if (hint === "table" && !isTs && tickerCount >= 2 && tickerCount <= 4 && data.columns.length >= 2)
      return "compare";
    return hint;
  }
  if (isTs) return tickerCount <= 4 && data.columns.length === 1 ? "line" : "table";
  if (tickerCount === 1) return "kpi";
  // A ranking ("rank by ROE") is one metric across several rows: bars beat a table.
  if (data.columns.length === 1 && data.rows.length >= 3) return "bar";
  // A head-to-head across a few companies reads best with companies as columns.
  if (tickerCount <= 4 && data.columns.length >= 2) return "compare";
  return "table";
}

function KpiTiles({ data }: { data: MetricQueryResult }) {
  const row = data.rows[0];
  return (
    <div>
      <div className="mb-2">
        <span className="font-semibold">{titleCase(String(row.company_name ?? row.ticker))}</span>{" "}
        <span className="text-neutral-500 text-sm"><TickerButton ticker={String(row.ticker)} /></span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {data.columns.map((c) => (
          <div key={c.key} data-explain="stat tile" className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 text-center">
            <div className="text-xs text-neutral-500"><MetricLabel column={c} /></div>
            <div className="text-lg font-semibold">{formatValue(row[c.key], c.unit)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultTable({ data }: { data: MetricQueryResult }) {
  const isTs = data.spec.period !== "latest";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
            <th className="py-1.5 pr-3">Ticker</th>
            {isTs && <th className="py-1.5 pr-3">Period</th>}
            {data.columns.map((c) => (
              <th key={c.key} className="py-1.5 pr-3 text-right"><MetricLabel column={c} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i} className="border-b border-neutral-100 dark:border-neutral-900">
              <td className="py-1.5 pr-3 font-medium">
                <TickerButton ticker={String(r.ticker)} />
                {!isTs && r.company_name ? (
                  <span className="text-neutral-500 font-normal"> {titleCase(String(r.company_name))}</span>
                ) : null}
              </td>
              {isTs && <td className="py-1.5 pr-3 text-neutral-500">{String(r.fiscal_label ?? r.period_end)}</td>}
              {data.columns.map((c) => (
                <td key={c.key} className="py-1.5 pr-3 text-right tabular-nums">
                  {formatValue(r[c.key], c.unit)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Which way is "better" for the head-to-head highlight. Absolute-size metrics
// (revenue, market cap, assets…) get no highlight — bigger isn't "winning".
const HIGHER_BETTER = new Set([
  "gross_margin", "operating_margin", "net_margin", "roe", "roa",
  "revenue_growth_yoy", "eps_growth_yoy", "current_ratio",
]);
const LOWER_BETTER = new Set(["pe_ttm", "ps_ttm", "debt_to_equity"]);

// Head-to-head layout: companies as columns, one metric per row, the best
// value of each row marked. Used for 2–4 tickers with several metrics.
function bestIndexFor(c: MetricColumn, companies: Row[]): number {
  if (!HIGHER_BETTER.has(c.key) && !LOWER_BETTER.has(c.key)) return -1;
  const vals = companies.map((r) => {
    const v = r[c.key];
    const n = v === null || v === undefined || v === "" ? null : Number(v);
    return Number.isFinite(n as number) ? (n as number) : null;
  });
  if (vals.filter((v) => v !== null).length < 2) return -1;
  const dir = HIGHER_BETTER.has(c.key) ? 1 : -1;
  let best = -1;
  vals.forEach((v, i) => {
    if (v !== null && (best === -1 || (v - (vals[best] as number)) * dir > 0)) best = i;
  });
  return best;
}

function CompareTable({ data }: { data: MetricQueryResult }) {
  const companies = data.rows;
  const bests = data.columns.map((c) => bestIndexFor(c, companies));
  const marked = bests.some((b) => b !== -1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs border-b border-neutral-200 dark:border-neutral-800">
            <th className="py-1.5 pr-3 font-normal text-neutral-500">Metric</th>
            {companies.map((r, i) => (
              <th key={i} className="py-1.5 px-3 text-right align-top">
                <div className="font-semibold"><TickerButton ticker={String(r.ticker)} /></div>
                <div className="font-normal text-neutral-500">{titleCase(String(r.company_name ?? ""))}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.columns.map((c, ci) => {
            const bestIdx = bests[ci];
            return (
              <tr key={c.key} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-1.5 pr-3 text-neutral-500"><MetricLabel column={c} /></td>
                {companies.map((r, i) => (
                  <td key={i} className={`py-1.5 px-3 text-right tabular-nums ${i === bestIdx ? "font-semibold" : ""}`}>
                    {i === bestIdx && (
                      <span
                        className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                        style={{ background: "var(--viz-good)" }}
                      />
                    )}
                    {formatValue(r[c.key], c.unit)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {marked && <p className="mt-1.5 text-[11px] text-neutral-400">● best of this group on the metric</p>}
    </div>
  );
}

// Pivot timeseries rows (one per ticker × period) into one point per period
// with a value column per ticker. The x value is real time (epoch ms):
// companies close their books in different months (AAPL Sep, MSFT Jun,
// NVDA Jan), so a categorical axis would interleave 15 unrelated ticks and
// no two series would ever share an x position.
function pivotByTicker(rows: Row[], metricKey: string) {
  const tickers = [...new Set(rows.map((r) => String(r.ticker)))];
  const byPeriod = new Map<string, Record<string, string | number | null>>();
  for (const r of rows) {
    const period = String(r.period_end);
    if (!byPeriod.has(period)) byPeriod.set(period, { t: new Date(period).getTime() });
    byPeriod.get(period)![String(r.ticker)] = r[metricKey];
  }
  const points = [...byPeriod.values()].sort((a, b) => Number(a.t) - Number(b.t));
  return { tickers, points };
}

const monthYear = (t: number) =>
  new Date(t).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

function TsLineChart({ data, column }: { data: MetricQueryResult; column: MetricColumn }) {
  const { tickers, points } = pivotByTicker(data.rows, column.key);
  const annual = data.spec.period === "annual_5y";
  // Fiscal years end in different months per company; auto ticks on the time
  // axis then repeat the same year label. One mid-year tick per covered year.
  const ticks = annual
    ? [...new Set(points.map((p) => new Date(Number(p.t)).getUTCFullYear()))]
        .sort()
        .map((y) => Date.UTC(y, 6, 1))
        .filter((t) => t >= Number(points[0]?.t) && t <= Number(points[points.length - 1]?.t))
    : undefined;
  return (
    <div>
      <div className="text-sm font-medium mb-1"><MetricLabel column={column} /></div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={points}>
          <XAxis
            dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]}
            fontSize={11} tick={{ fill: "var(--viz-muted)" }}
            axisLine={{ stroke: "var(--viz-axis)" }} tickLine={false}
            ticks={ticks}
            tickFormatter={(t: number) =>
              annual ? String(new Date(t).getUTCFullYear()) : monthYear(t)}
          />
          <YAxis fontSize={11} width={60} tick={{ fill: "var(--viz-muted)" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatValue(v, column.unit)} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v) => formatValue(Number(v), column.unit)}
            labelFormatter={(t) => `Period ending ${monthYear(Number(t))}`}
          />
          <Legend />
          {tickers.map((t, i) => {
            const color = LINE_COLORS[i % LINE_COLORS.length];
            return (
              <Line key={t} type="monotone" dataKey={t} stroke={color} strokeWidth={2}
                    dot={{ r: 2.5, fill: color, strokeWidth: 0 }} connectNulls
                    isAnimationActive={false} />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function LatestBarChart({ data }: { data: MetricQueryResult }) {
  const column = data.columns[0];
  const points = data.rows.map((r) => ({ ticker: String(r.ticker), value: r[column.key] }));
  return (
    <div>
      <div className="text-sm font-medium mb-1"><MetricLabel column={column} /></div>
      <ResponsiveContainer width="100%" height={Math.max(160, points.length * 28)}>
        <BarChart data={points} layout="vertical" margin={{ right: 56 }}>
          <XAxis type="number" fontSize={11} tick={{ fill: "var(--viz-muted)" }} axisLine={{ stroke: "var(--viz-axis)" }} tickLine={false} tickFormatter={(v: number) => formatValue(v, column.unit)} />
          <YAxis type="category" dataKey="ticker" fontSize={11} width={60} tick={{ fill: "var(--viz-muted)" }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatValue(Number(v), column.unit)} />
          <Bar dataKey="value" fill="var(--viz-1)" radius={[0, 3, 3, 0]} maxBarSize={18} isAnimationActive={false}>
            <LabelList
              dataKey="value" position="right"
              formatter={(v: unknown) => formatValue(v, column.unit)}
              fontSize={11} fill="var(--viz-muted)"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Context-sensitive follow-ups: only offer what the tools can actually answer
// (a "5-year history" chip is wrong for latest-only metrics like P/E).
function followUpsFor(data: MetricQueryResult, mode: Mode) {
  const tickers = [...new Set(data.rows.map((r) => String(r.ticker)))];
  const labels = data.columns.map((c) => c.label.toLowerCase()).join(", ");
  const asks: { label: string; prompt: string }[] = [];
  const isTs = data.spec.period !== "latest";
  if (isTs) {
    asks.push({ label: "Latest snapshot", prompt: `Show the latest ${labels} for ${tickers.join(", ")}` });
  } else if (data.spec.metrics.every((k) => METRICS[k].periodExpr !== null) && tickers.length <= 8) {
    asks.push({ label: "5-year history", prompt: `Chart ${labels} over the last 5 years for ${tickers.join(", ")}` });
  }
  if (mode === "bar" && tickers.length > 1) {
    asks.push({ label: `${tickers[0]} overview`, prompt: `Give me the full overview of ${tickers[0]}` });
  }
  if (tickers.length === 1) {
    asks.push({ label: "Full company overview", prompt: `Give me the full overview of ${tickers[0]}` });
  }
  return asks;
}

export function MetricResult({ data }: { data: MetricQueryResult }) {
  const mode = chooseDisplay(data);
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 my-2 space-y-3">
      {mode === "kpi" && <KpiTiles data={data} />}
      {mode === "compare" && <CompareTable data={data} />}
      {mode === "line" &&
        data.columns.map((c) => <TsLineChart key={c.key} data={data} column={c} />)}
      {mode === "bar" && data.spec.period === "latest" && data.columns.length >= 1 && (
        <LatestBarChart data={data} />
      )}
      {(mode === "table" || (mode === "bar" && data.spec.period !== "latest")) && (
        <ResultTable data={data} />
      )}
      {mode === "bar" && data.spec.period === "latest" && data.columns.length > 1 && (
        <ResultTable data={data} />
      )}
      <FollowUps asks={followUpsFor(data, mode)} />
    </div>
  );
}
