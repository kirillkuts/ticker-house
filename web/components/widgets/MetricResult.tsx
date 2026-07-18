"use client";

import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import type { MetricQueryResult, MetricColumn } from "@/lib/metric-query";
import type { Unit } from "@/lib/metric-registry";

const LINE_COLORS = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2", "#be185d", "#4d7c0f"];

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
type Mode = "table" | "line" | "bar" | "kpi";

function chooseDisplay(data: MetricQueryResult): Mode {
  const hint = data.spec.display;
  const isTs = data.spec.period !== "latest";
  const tickerCount = new Set(data.rows.map((r) => r.ticker)).size;

  if (hint && hint !== "auto") {
    // Ignore hints impossible for the shape: a line needs a time axis.
    if (hint === "line" && !isTs) return "table";
    if (hint === "kpi" && (isTs || tickerCount > 1)) return "table";
    return hint;
  }
  if (isTs) return tickerCount <= 4 && data.columns.length === 1 ? "line" : "table";
  if (tickerCount === 1) return "kpi";
  return "table";
}

function KpiTiles({ data }: { data: MetricQueryResult }) {
  const row = data.rows[0];
  return (
    <div>
      <div className="mb-2">
        <span className="font-semibold">{String(row.company_name ?? row.ticker)}</span>{" "}
        <span className="text-neutral-500 text-sm">{String(row.ticker)}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {data.columns.map((c) => (
          <div key={c.key} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 text-center">
            <div className="text-xs text-neutral-500">{c.label}</div>
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
              <th key={c.key} className="py-1.5 pr-3 text-right">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i} className="border-b border-neutral-100 dark:border-neutral-900">
              <td className="py-1.5 pr-3 font-medium">
                {String(r.ticker)}
                {!isTs && r.company_name ? (
                  <span className="text-neutral-500 font-normal"> {String(r.company_name)}</span>
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

// Pivot timeseries rows (one per ticker × period) into one point per period
// with a value column per ticker, for the multi-line chart.
function pivotByTicker(rows: Row[], metricKey: string) {
  const tickers = [...new Set(rows.map((r) => String(r.ticker)))];
  const byPeriod = new Map<string, Record<string, string | number | null>>();
  for (const r of rows) {
    const period = String(r.period_end);
    if (!byPeriod.has(period)) byPeriod.set(period, { period: period.slice(0, 7) });
    byPeriod.get(period)![String(r.ticker)] = r[metricKey];
  }
  const points = [...byPeriod.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, p]) => p);
  return { tickers, points };
}

function TsLineChart({ data, column }: { data: MetricQueryResult; column: MetricColumn }) {
  const { tickers, points } = pivotByTicker(data.rows, column.key);
  return (
    <div>
      <div className="text-sm font-medium mb-1">{column.label}</div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={points}>
          <XAxis dataKey="period" fontSize={11} />
          <YAxis fontSize={11} width={60} tickFormatter={(v: number) => formatValue(v, column.unit)} />
          <Tooltip formatter={(v) => formatValue(Number(v), column.unit)} />
          <Legend />
          {tickers.map((t, i) => (
            <Line key={t} type="monotone" dataKey={t} stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  dot={false} strokeWidth={2} connectNulls />
          ))}
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
      <div className="text-sm font-medium mb-1">{column.label}</div>
      <ResponsiveContainer width="100%" height={Math.max(160, points.length * 28)}>
        <BarChart data={points} layout="vertical">
          <XAxis type="number" fontSize={11} tickFormatter={(v: number) => formatValue(v, column.unit)} />
          <YAxis type="category" dataKey="ticker" fontSize={11} width={60} />
          <Tooltip formatter={(v) => formatValue(Number(v), column.unit)} />
          <Bar dataKey="value" fill="#2563eb" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MetricResult({ data }: { data: MetricQueryResult }) {
  const mode = chooseDisplay(data);
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 my-2 space-y-3">
      {mode === "kpi" && <KpiTiles data={data} />}
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
    </div>
  );
}
