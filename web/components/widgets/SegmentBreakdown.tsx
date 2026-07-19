"use client";

import {
  Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { SegmentBreakdownData } from "@/lib/views";
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

// Fixed hue order; segments keep their color across both charts because both
// draw from the same ordered list.
const HUES = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)",
              "var(--viz-5)", "var(--viz-6)", "var(--viz-7)", "var(--viz-8)"];

// Recharts wants one object per x-position with a key per series.
function pivot(years: string[], series: { label: string; values: (number | null)[] }[]) {
  return years.map((year, i) => ({
    year,
    ...Object.fromEntries(series.map((s) => [s.label, s.values[i]])),
  }));
}

export function SegmentBreakdown({ data }: { data: SegmentBreakdownData }) {
  const revenueRows = pivot(data.years, data.segments.map((s) => ({ label: s.label, values: s.revenue })));
  const opSeries = data.segments.filter((s) => s.opIncome.some((v) => v !== null));
  const opRows = pivot(data.years, opSeries.map((s) => ({ label: s.label, values: s.opIncome })));
  const geoRows = pivot(data.years, data.geography.map((g) => ({ label: g.label, values: g.revenue })));
  // Views persisted before the product split existed lack the field.
  const products = data.products ?? [];
  const prodRows = pivot(data.years, products.map((p) => ({ label: p.label, values: p.revenue })));
  const lastIdx = data.years.length - 1;

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 my-2 space-y-4">
      <div>
        <span className="font-semibold">{titleCase(data.companyName)}</span>{" "}
        <span className="text-neutral-500 text-sm">
          {data.ticker} · {data.axisUsed === "business" ? "business segments" : "segments (by product line)"} · annual
        </span>
      </div>

      {data.singleSegment ? (
        <div className="text-sm text-neutral-500">
          {data.ticker} reports as a single segment, so there is no internal split to chart.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {data.segments.map((s, i) => (
              <span key={s.member} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: HUES[i % HUES.length] }} />
                <span className="text-neutral-500">{s.label}</span>
                <span className="font-medium">{fmtMoney(s.revenue[lastIdx])}</span>
              </span>
            ))}
          </div>

          <div>
            <div className="text-xs text-neutral-500 mb-1">Revenue by segment</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={revenueRows} margin={{ top: 6, right: 6, bottom: 0, left: 0 }} barCategoryGap="25%">
                <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
                <XAxis dataKey="year" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={55} tickFormatter={(v: number) => axisMoney(v)} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [fmtMoney(Number(v)), name]} />
                {data.segments.map((s, i) => (
                  <Bar key={s.member} isAnimationActive={false} dataKey={s.label}
                       stackId={data.stackable ? "rev" : undefined}
                       fill={HUES[i % HUES.length]} stroke="var(--background)" strokeWidth={1}
                       maxBarSize={data.stackable ? 36 : 14}
                       radius={data.stackable ? undefined : [3, 3, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {opSeries.length > 0 && (
            <div>
              <div className="text-xs text-neutral-500 mb-1">Operating income by segment</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={opRows} margin={{ top: 6, right: 6, bottom: 0, left: 0 }} barCategoryGap="20%">
                  <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
                  <XAxis dataKey="year" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={55} tickFormatter={(v: number) => axisMoney(v)} />
                  <ReferenceLine y={0} stroke="var(--viz-axis)" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [fmtMoney(Number(v)), name]} />
                  {opSeries.map((s) => {
                    const i = data.segments.findIndex((x) => x.member === s.member);
                    return (
                      <Bar key={s.member} isAnimationActive={false} dataKey={s.label}
                           fill={HUES[i % HUES.length]} radius={[3, 3, 0, 0]} maxBarSize={18} />
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {products.length > 0 && (
        <div>
          <div className="text-xs text-neutral-500 mb-1">Revenue by product & service line (as reported)</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={prodRows} margin={{ top: 6, right: 6, bottom: 0, left: 0 }} barCategoryGap="25%">
              <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
              <XAxis dataKey="year" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={55} tickFormatter={(v: number) => axisMoney(v)} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [fmtMoney(Number(v)), name]} />
              {products.map((p, i) => (
                <Bar key={p.member} isAnimationActive={false} dataKey={p.label} stackId="prod"
                     fill={HUES[i % HUES.length]} stroke="var(--background)" strokeWidth={1} maxBarSize={36} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-1">
            {products.map((p, i) => (
              <span key={p.member} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: HUES[i % HUES.length] }} />
                <span className="text-neutral-500">{p.label}</span>
                <span className="font-medium">{fmtMoney(p.revenue[lastIdx])}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {data.geography.length > 0 && (
        <div>
          <div className="text-xs text-neutral-500 mb-1">Revenue by geography (as the company defines its regions)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={geoRows} margin={{ top: 6, right: 6, bottom: 0, left: 0 }} barCategoryGap="25%">
              <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
              <XAxis dataKey="year" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={55} tickFormatter={(v: number) => axisMoney(v)} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [fmtMoney(Number(v)), name]} />
              {data.geography.map((g, i) => (
                <Bar key={g.member} isAnimationActive={false} dataKey={g.label} stackId="geo"
                     fill={HUES[i % HUES.length]} stroke="var(--background)" strokeWidth={1} maxBarSize={36} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-1">
            {data.geography.map((g, i) => (
              <span key={g.member} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: HUES[i % HUES.length] }} />
                <span className="text-neutral-500">{g.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <FollowUps
        asks={[
          { label: "Expense breakdown", prompt: `Where does ${data.ticker} spend its money?` },
          { label: "Full company overview", prompt: `Give me the full overview of ${data.ticker}` },
          { label: "Margin trend", prompt: `Show ${data.ticker}'s annual fundamentals` },
        ]}
      />
    </div>
  );
}
