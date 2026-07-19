"use client";

import {
  Bar, BarChart, Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import type { FundamentalsData } from "@/lib/views";
import { FollowUps } from "./FollowUps";
import { FactDot, useFactMarkers } from "./FactMarkers";
import { axisMoney, titleCase } from "./CompanyOverview";

function fmtMoney(v: number | null): string {
  if (v === null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toFixed(0)}`;
}

const AXIS_TICK = { fill: "var(--viz-muted)", fontSize: 11 };
const AXIS_LINE = { stroke: "var(--viz-axis)" };
const TOOLTIP_STYLE = {
  background: "var(--tooltip-bg)",
  border: "1px solid var(--tooltip-border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--foreground)",
};

const lastNonNull = (xs: (number | null)[]): number | null =>
  [...xs].reverse().find((x) => x !== null) ?? null;

export function Fundamentals({ data }: { data: FundamentalsData }) {
  const points = data.rows;
  // Fact anchors from the model's explanation (task 029); [] outside chat.
  const factsFor = useFactMarkers(data.ticker);
  const legend = [
    { color: "var(--viz-1)", label: "Revenue", value: fmtMoney(lastNonNull(points.map((r) => r.revenue))) },
    { color: "var(--viz-2)", label: "Net income", value: fmtMoney(lastNonNull(points.map((r) => r.netIncome))) },
    { color: "var(--viz-3)", label: "Net margin", value: `${lastNonNull(points.map((r) => r.netMarginPct))?.toFixed(1) ?? "—"}%` },
  ];

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 my-2 space-y-4">
      <div>
        <span className="font-semibold">{titleCase(data.companyName)}</span>{" "}
        <span className="text-neutral-500 text-sm">
          {data.ticker} · {data.periodType === "quarter" ? "quarterly" : "annual"} fundamentals
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {legend.map((it) => (
          <span key={it.label} data-explain="legend entry" className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: it.color }} />
            <span className="text-neutral-500">{it.label}</span>
            <span className="font-medium">{it.value}</span>
          </span>
        ))}
      </div>

      {/* One measure per axis: dollars as bars, the margin as its own small
          percent chart below — never a second y-axis. */}
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: 0 }} barCategoryGap="25%">
          <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
          <XAxis dataKey="fiscalLabel" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={55} tickFormatter={(v: number) => axisMoney(v)} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [fmtMoney(Number(v)), name]} />
          <Bar isAnimationActive={false} dataKey="revenue" name="Revenue" fill="var(--viz-1)" radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Bar isAnimationActive={false} dataKey="netIncome" name="Net income" fill="var(--viz-2)" radius={[3, 3, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
      <div>
        <div className="text-xs text-neutral-500 mb-1">Net margin</div>
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={points} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey="fiscalLabel" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={45} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${Number(v).toFixed(1)}%`, "net margin"]} />
            <Line isAnimationActive={false} type="monotone" dataKey="netMarginPct" name="Net margin"
                  stroke="var(--viz-3)" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-neutral-500 text-left">
            <th className="py-1 font-normal">Period</th>
            <th className="py-1 font-normal text-right">Revenue</th>
            <th className="py-1 font-normal text-right">Net income</th>
            <th className="py-1 font-normal text-right">Net margin</th>
            <th className="py-1 font-normal text-right">Diluted EPS</th>
            <th className="py-1 font-normal text-right">FCF</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.periodEnd} className="border-t border-neutral-100 dark:border-neutral-800">
              <td className="py-1">{r.fiscalLabel}</td>
              <td className="py-1 text-right">{fmtMoney(r.revenue)}<FactDot markers={factsFor(r.fiscalLabel, "revenue")} /></td>
              <td className="py-1 text-right">{fmtMoney(r.netIncome)}<FactDot markers={factsFor(r.fiscalLabel, "net_income")} /></td>
              <td className="py-1 text-right">{r.netMarginPct !== null ? `${r.netMarginPct.toFixed(1)}%` : "—"}<FactDot markers={factsFor(r.fiscalLabel, "net_margin")} /></td>
              <td className="py-1 text-right">{r.dilutedEps?.toFixed(2) ?? "—"}<FactDot markers={factsFor(r.fiscalLabel, "eps")} /></td>
              <td className="py-1 text-right">{fmtMoney(r.freeCashFlow)}<FactDot markers={factsFor(r.fiscalLabel, "fcf")} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <FollowUps
        asks={[
          data.periodType === "quarter"
            ? { label: "Annual view", prompt: `Show ${data.ticker}'s annual fundamentals` }
            : { label: "Quarterly view", prompt: `Show ${data.ticker}'s quarterly fundamentals` },
          { label: "Full company overview", prompt: `Give me the full overview of ${data.ticker}` },
          { label: "Margins vs peers", prompt: "Compare net margins across the covered stocks" },
        ]}
      />
    </div>
  );
}
