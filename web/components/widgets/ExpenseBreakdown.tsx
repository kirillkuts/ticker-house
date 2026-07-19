"use client";

import {
  Bar, BarChart, Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import type { ExpenseBreakdownData, ExpensePeriodRow } from "@/lib/views";
import { FollowUps } from "./FollowUps";
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

// Fixed entity->hue assignment; a company missing a line drops the segment,
// the survivors keep their colors.
const STACK: { key: keyof ExpensePeriodRow; label: string; color: string; whenSplit?: boolean }[] = [
  { key: "costOfRevenue", label: "Cost of revenue", color: "var(--viz-1)" },
  { key: "researchAndDevelopment", label: "R&D", color: "var(--viz-2)" },
  { key: "sellingAndMarketing", label: "Sales & marketing", color: "var(--viz-3)", whenSplit: true },
  { key: "generalAndAdmin", label: "General & admin", color: "var(--viz-4)", whenSplit: true },
  { key: "sellingGeneralAdmin", label: "SG&A", color: "var(--viz-3)", whenSplit: false },
  { key: "otherOperating", label: "Other operating", color: "var(--viz-6)" },
  { key: "operatingIncome", label: "Operating income", color: "var(--viz-5)" },
];

export function ExpenseBreakdown({ data }: { data: ExpenseBreakdownData }) {
  const rows = data.rows;
  const last = rows[rows.length - 1];
  const segments = STACK.filter(
    (s) => (s.whenSplit === undefined || s.whenSplit === data.hasSplit) && rows.some((r) => r[s.key] !== null),
  );
  const pctOfRev = (r: ExpensePeriodRow, v: number | null) =>
    v !== null && r.revenue ? `${((v / r.revenue) * 100).toFixed(1)}%` : "—";

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 my-2 space-y-4">
      <div>
        <span className="font-semibold">{titleCase(data.companyName)}</span>{" "}
        <span className="text-neutral-500 text-sm">
          {data.ticker} · where the revenue goes · {data.periodType === "quarter" ? "quarterly" : "annual"}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-neutral-500">{s.label}</span>
            <span className="font-medium">{fmtMoney(last[s.key] as number | null)}</span>
          </span>
        ))}
      </div>

      {/* Segments stack to total revenue, so bar height = revenue and the
          green cap is what's left after expenses. */}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ top: 6, right: 6, bottom: 0, left: 0 }} barCategoryGap="25%">
          <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
          <XAxis dataKey="fiscalLabel" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={55} tickFormatter={(v: number) => axisMoney(v)} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v, name, item) => [
              `${fmtMoney(Number(v))} (${pctOfRev(item?.payload as ExpensePeriodRow, Number(v))} of revenue)`,
              name,
            ]}
          />
          {segments.map((s) => (
            <Bar key={s.label} isAnimationActive={false} dataKey={s.key} name={s.label} stackId="rev"
                 fill={s.color} stroke="var(--background)" strokeWidth={1} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>

      <div>
        <div className="text-xs text-neutral-500 mb-1">Operating margin</div>
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={rows} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey="fiscalLabel" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={45} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${Number(v).toFixed(1)}%`, "operating margin"]} />
            <Line isAnimationActive={false} type="monotone" dataKey="opMarginPct" name="Operating margin"
                  stroke="var(--viz-7)" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-neutral-500 text-left">
            <th className="py-1 font-normal">{last.fiscalLabel}</th>
            <th className="py-1 font-normal text-right">Amount</th>
            <th className="py-1 font-normal text-right">% of revenue</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-neutral-100 dark:border-neutral-800">
            <td className="py-1">Revenue</td>
            <td className="py-1 text-right">{fmtMoney(last.revenue)}</td>
            <td className="py-1 text-right">100%</td>
          </tr>
          {segments.map((s) => (
            <tr key={s.label} className="border-t border-neutral-100 dark:border-neutral-800">
              <td className="py-1">{s.label}</td>
              <td className="py-1 text-right">{fmtMoney(last[s.key] as number | null)}</td>
              <td className="py-1 text-right">{pctOfRev(last, last[s.key] as number | null)}</td>
            </tr>
          ))}
          {last.depreciationAmortization !== null && (
            <tr className="border-t border-neutral-100 dark:border-neutral-800 text-neutral-500">
              <td className="py-1">D&A (included above)</td>
              <td className="py-1 text-right">{fmtMoney(last.depreciationAmortization)}</td>
              <td className="py-1 text-right">{pctOfRev(last, last.depreciationAmortization)}</td>
            </tr>
          )}
          {last.shareBasedCompensation !== null && (
            <tr className="border-t border-neutral-100 dark:border-neutral-800 text-neutral-500">
              <td className="py-1">Stock comp (included above)</td>
              <td className="py-1 text-right">{fmtMoney(last.shareBasedCompensation)}</td>
              <td className="py-1 text-right">{pctOfRev(last, last.shareBasedCompensation)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <FollowUps
        asks={[
          { label: "Revenue by segment", prompt: `Show ${data.ticker}'s revenue by business segment` },
          data.periodType === "annual"
            ? { label: "Quarterly view", prompt: `Show ${data.ticker}'s expense breakdown by quarter` }
            : { label: "Annual view", prompt: `Show ${data.ticker}'s annual expense breakdown` },
          { label: "Full company overview", prompt: `Give me the full overview of ${data.ticker}` },
        ]}
      />
    </div>
  );
}
