"use client";

import { useContext } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import type { CompanyOverviewData } from "@/lib/views";
import { formatValue } from "./MetricResult";
import { FollowUps, AskContext } from "./FollowUps";

// One-click head-to-head against any other covered company.
function CompareWith({ tk, peers }: { tk: string; peers: string[] }) {
  const { ask, busy } = useContext(AskContext);
  if (!ask || peers.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
      <span className="text-neutral-400">Head-to-head vs</span>
      {peers.map((p) => (
        <button
          key={p}
          type="button"
          disabled={busy}
          onClick={() =>
            ask(`Compare ${tk} and ${p} head-to-head: P/E, P/S, revenue growth, net margin, return on equity and debt to equity`)
          }
          title={`Compare ${tk} with ${p}`}
          className="rounded-md border border-neutral-200 dark:border-neutral-800 px-2 py-0.5 font-medium text-neutral-600 dark:text-neutral-300 transition-colors enabled:hover:border-blue-400 enabled:hover:text-blue-600 dark:enabled:hover:text-blue-400 disabled:opacity-50"
        >
          {p}
        </button>
      ))}
    </div>
  );
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

const money = (v: number | null) => formatValue(v, "usd_large");
const pct = (v: number | null) => formatValue(v, "percent");
const ratio = (v: number | null) => formatValue(v, "ratio");
const usd = (v: number | null) => formatValue(v, "per_share");

// Compact axis ticks: "$450B", not "$450.00B".
export function axisMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(1).replace(/\.0$/, "")}T`;
  if (abs >= 1e9) return `$${Math.round(v / 1e9)}B`;
  if (abs >= 1e6) return `$${Math.round(v / 1e6)}M`;
  return `$${v.toFixed(0)}`;
}

// Gentle title case for shouting names from SEC data ("MICROSOFT CORP",
// "ELI LILLY & Co"). Mostly-uppercase is the trigger — an exact all-caps
// check misses names with a stray lowercase syllable.
export function titleCase(name: string): string {
  const letters = name.replace(/[^a-z]/gi, "");
  const uppers = letters.replace(/[^A-Z]/g, "");
  if (letters.length === 0 || uppers.length / letters.length < 0.8) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s(&/-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

// Short display form for cards and headers: title-cased, legal suffixes
// dropped ("Meta Platforms, Inc." → "Meta Platforms"), known brand casings
// restored ("Jpmorgan" → "JPMorgan").
const NAME_FIXES: Record<string, string> = {
  jpmorgan: "JPMorgan",
  nvidia: "NVIDIA",
};

export function companyDisplayName(name: string): string {
  let n = titleCase(name.trim());
  n = n.replace(/(?:,?\s+(?:&\s+)?(?:Inc|Incorporated|Corp|Corporation|Company|Co|Ltd|Limited|Plc|LLC|LP)\.?)+$/i, "");
  n = n.replace(/\bAmazon Com\b/i, "Amazon.com");
  n = n.split(/\s+/).map((w) => NAME_FIXES[w.toLowerCase()] ?? w).join(" ");
  return n || titleCase(name.trim());
}

function Delta({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-neutral-400">—</span>;
  const up = value >= 0;
  return (
    <span style={{ color: up ? "var(--viz-up-text)" : "var(--viz-down-text)" }} className="font-medium">
      {up ? "▲" : "▼"} {up ? "+" : ""}{value.toFixed(2)}%{suffix}
    </span>
  );
}

function Section({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {caption && <span className="text-xs text-neutral-500">{caption}</span>}
      </div>
      {children}
    </section>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {hint && <div className="text-[11px] text-neutral-400">{hint}</div>}
    </div>
  );
}

function LegendRow({ items }: { items: { color: string; label: string; value?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: it.color }} />
          <span className="text-neutral-500">{it.label}</span>
          {it.value && <span className="font-medium">{it.value}</span>}
        </span>
      ))}
    </div>
  );
}

function ScoreMeter({ axis, score, detail }: { axis: string; score: number | null; detail: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span>{axis}</span>
        <span className="font-semibold">{score === null ? "—" : `${score.toFixed(1)}`}<span className="text-neutral-400 font-normal text-xs"> /5</span></span>
      </div>
      <div className="mt-1 h-2 rounded-full" style={{ background: "var(--viz-1-soft)" }}>
        <div
          className="h-2 rounded-full"
          style={{ background: "var(--viz-1)", width: `${((score ?? 0) / 5) * 100}%` }}
        />
      </div>
      <div className="mt-0.5 text-[11px] text-neutral-500">{detail}</div>
    </div>
  );
}

// Emphasis comparison: the company in the accent hue, the peer median in gray.
function CompareBars({ metric, company, peerMedian }: { metric: string; company: number | null; peerMedian: number | null }) {
  const max = Math.max(company ?? 0, peerMedian ?? 0) || 1;
  const row = (label: string, v: number | null, color: string, bold: boolean) => (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-neutral-500">{label}</span>
      <div className="flex-1 flex items-center gap-2">
        <div
          className="h-2.5 rounded-r"
          style={{ background: color, width: `${v === null ? 0 : Math.max((v / max) * 100, 1)}%` }}
        />
        <span className={bold ? "font-semibold" : "text-neutral-500"}>{ratio(v)}</span>
      </div>
    </div>
  );
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium">{metric}</div>
      {row("this company", company, "var(--viz-1)", true)}
      {row("peer median", peerMedian, "var(--viz-muted)", false)}
    </div>
  );
}

const lastNonNull = <T,>(xs: (T | null)[]): T | null =>
  [...xs].reverse().find((x) => x !== null) ?? null;

export function CompanyOverview({ data }: { data: CompanyOverviewData }) {
  const t = data.ttm;
  const tk = data.ticker;
  const pricePoints = data.prices.map((p) => ({ ...p, label: p.date.slice(5) }));
  const quarterPoints = data.quarterly.map((q) => ({
    ...q,
    label: q.fiscalLabel.replace(/ 20(\d\d)$/, " '$1"),
  }));
  const radarPoints = data.scores.map((s) => ({ axis: s.axis, score: s.score ?? 0 }));
  const window = `${data.priceWindow.from.slice(5)} → ${data.priceWindow.to.slice(5)}`;
  const years =
    data.annual.length > 1
      ? `FY${data.annual[0].fiscalYear}–FY${data.annual[data.annual.length - 1].fiscalYear}`
      : "";

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 my-2 space-y-6">
      {/* Identity + price header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-lg font-semibold leading-tight">{titleCase(data.companyName)}</div>
          <div className="text-sm text-neutral-500">
            {data.ticker} · {data.industry || data.sector}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold leading-tight">${data.kpis.lastClose.toFixed(2)}</div>
          <div className="text-sm"><Delta value={data.kpis.changePct} suffix={` (${window})`} /></div>
        </div>
      </div>

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile label="Market cap" value={money(t.marketCap)} />
        <StatTile label="P/E (TTM)" value={ratio(t.peTtm)} />
        <StatTile label="Revenue (TTM)" value={money(t.revenue)} hint={t.revenueGrowthYoy !== null ? `${t.revenueGrowthYoy >= 0 ? "+" : ""}${t.revenueGrowthYoy.toFixed(1)}% YoY` : undefined} />
        <StatTile label="Net margin (TTM)" value={pct(t.netMargin)} />
      </div>
      <FollowUps
        asks={[
          { label: "Is it a good company?", prompt: `Compare ${tk} against the covered stocks on net margin, return on equity, revenue growth and debt to equity, then give your verdict: is it a good company?` },
          { label: "Rank peers by market cap", prompt: "Rank the covered stocks by market cap" },
        ]}
      />

      {/* About */}
      {data.about?.description && (
        <Section title="About">
          <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
            {data.about.description}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
            {data.about.headquarters && <span>{data.about.headquarters}</span>}
            {data.about.employees !== null && (
              <span>{new Intl.NumberFormat("en-US").format(data.about.employees)} employees</span>
            )}
            {data.about.website && (
              <a
                href={data.about.website}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted underline-offset-2 hover:text-blue-600 dark:hover:text-blue-400"
              >
                {data.about.website.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            )}
          </div>
          <FollowUps
            asks={[
              { label: "Revenue & profit trend", prompt: `Chart ${tk}'s revenue and net income over the last 5 years` },
              { label: "Closest business peers", prompt: `Compare ${tk} with its closest covered peers on P/E, net margin and revenue growth` },
            ]}
          />
        </Section>
      )}

      {/* Scores */}
      <Section title="Company score" caption={`percentile rank vs the ${data.peersCount} covered large caps`}>
        <div className="grid gap-4 sm:grid-cols-[260px_1fr] items-center">
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarPoints} outerRadius="65%">
              <PolarGrid stroke="var(--viz-grid)" />
              <PolarAngleAxis dataKey="axis" tick={AXIS_TICK} />
              <PolarRadiusAxis domain={[0, 5]} tick={false} axisLine={false} />
              <Radar
                dataKey="score"
                stroke="var(--viz-1)"
                strokeWidth={2}
                fill="var(--viz-1)"
                fillOpacity={0.15}
                dot={{ r: 3, fill: "var(--viz-1)" }}
                isAnimationActive={false}
              />
            </RadarChart>
          </ResponsiveContainer>
          <div className="space-y-3">
            {data.scores.map((s) => (
              <ScoreMeter key={s.axis} axis={s.axis} score={s.score} detail={s.detail} />
            ))}
          </div>
        </div>
        <FollowUps
          asks={[
            { label: "Metrics behind the scores", prompt: `Show the metrics behind ${tk}'s scores vs the covered stocks: P/E, net margin, return on equity, revenue growth and debt to equity` },
            { label: "Compare vs all peers", prompt: `Compare ${tk} with the other covered stocks on net margin, return on equity and revenue growth` },
          ]}
        />
        <CompareWith tk={tk} peers={data.peerTickers ?? []} />
      </Section>

      {/* Price */}
      <Section title="Price" caption={`${window} · high $${data.kpis.high.toFixed(2)} · low $${data.kpis.low.toFixed(2)}`}>
        <ResponsiveContainer width="100%" height={170}>
          <AreaChart data={pricePoints} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
            <YAxis domain={["auto", "auto"]} tick={AXIS_TICK} axisLine={false} tickLine={false} width={55}
                   tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`$${Number(v).toFixed(2)}`, "close"]} />
            <Area isAnimationActive={false} type="monotone" dataKey="close" stroke="var(--viz-1)" strokeWidth={2}
                  fill="var(--viz-1)" fillOpacity={0.1} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        <FollowUps
          asks={[
            { label: "Full price dashboard", prompt: `Show the full price dashboard for ${tk} over the last month` },
            { label: "Price vs earnings", prompt: `Compare ${tk}'s P/E and EPS against the covered stocks — is the current price justified?` },
          ]}
        />
      </Section>

      {/* Valuation vs peers */}
      <Section title="Valuation vs peers" caption="peer set = the covered universe">
        <div className="grid gap-4 sm:grid-cols-2">
          {data.valuation.map((v) => (
            <CompareBars key={v.metric} metric={v.metric} company={v.company} peerMedian={v.peerMedian} />
          ))}
        </div>
        <FollowUps
          asks={[
            { label: "Rank peers by P/E", prompt: "Rank the covered stocks by P/E, cheapest first" },
            { label: "Cheaper alternatives", prompt: `Which covered stocks are cheaper than ${tk} on P/E but still growing revenue?` },
          ]}
        />
      </Section>

      {/* Growth */}
      <Section title="Growth" caption={years}>
        <LegendRow
          items={[
            { color: "var(--viz-1)", label: "Revenue", value: money(lastNonNull(data.annual.map((r) => r.revenue))) },
            { color: "var(--viz-2)", label: "Net income", value: money(lastNonNull(data.annual.map((r) => r.netIncome))) },
          ]}
        />
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data.annual} margin={{ top: 6, right: 6, bottom: 0, left: 0 }} barCategoryGap="25%">
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey="fiscalYear" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={55} tickFormatter={(v: number) => axisMoney(v)} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [money(Number(v)), name]} />
            <Bar isAnimationActive={false} dataKey="revenue" name="Revenue" fill="var(--viz-1)" radius={[3, 3, 0, 0]} maxBarSize={18} />
            <Bar isAnimationActive={false} dataKey="netIncome" name="Net income" fill="var(--viz-2)" radius={[3, 3, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
        {quarterPoints.length > 1 && (
          <div>
            <div className="text-xs text-neutral-500 mb-1">Last {quarterPoints.length} quarters</div>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={quarterPoints} margin={{ top: 4, right: 6, bottom: 0, left: 0 }} barCategoryGap="25%">
                <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={55} tickFormatter={(v: number) => axisMoney(v)} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [money(Number(v)), name]} />
                <Bar isAnimationActive={false} dataKey="revenue" name="Revenue" fill="var(--viz-1)" radius={[3, 3, 0, 0]} maxBarSize={14} />
                <Bar isAnimationActive={false} dataKey="netIncome" name="Net income" fill="var(--viz-2)" radius={[3, 3, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <FollowUps
          asks={[
            { label: "Quarterly detail", prompt: `Show ${tk}'s quarterly fundamentals` },
            { label: "Growth vs peers", prompt: "Rank the covered stocks by revenue growth" },
            { label: "Revenue history vs a peer", prompt: `Chart ${tk}'s revenue over the last 5 years against its closest covered peer` },
          ]}
        />
      </Section>

      {/* Profitability */}
      <Section title="Profitability" caption="margins by fiscal year">
        <LegendRow
          items={[
            { color: "var(--viz-1)", label: "Gross margin", value: pct(lastNonNull(data.annual.map((r) => r.grossMarginPct))) },
            { color: "var(--viz-2)", label: "Operating margin", value: pct(lastNonNull(data.annual.map((r) => r.opMarginPct))) },
            { color: "var(--viz-3)", label: "Net margin", value: pct(lastNonNull(data.annual.map((r) => r.netMarginPct))) },
          ]}
        />
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data.annual} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey="fiscalYear" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={45} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [pct(Number(v)), name]} />
            <Line isAnimationActive={false} type="monotone" dataKey="grossMarginPct" name="Gross margin" stroke="var(--viz-1)" strokeWidth={2} dot={false} connectNulls />
            <Line isAnimationActive={false} type="monotone" dataKey="opMarginPct" name="Operating margin" stroke="var(--viz-2)" strokeWidth={2} dot={false} connectNulls />
            <Line isAnimationActive={false} type="monotone" dataKey="netMarginPct" name="Net margin" stroke="var(--viz-3)" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Return on equity" value={pct(t.roe)} />
          <StatTile label="Return on assets" value={pct(t.roa)} />
          <StatTile label="FCF margin" value={pct(t.fcfMargin)} hint={`FCF ${money(t.freeCashFlow)} TTM`} />
        </div>
        <FollowUps
          asks={[
            { label: "Margins vs peers", prompt: "Compare net margins across the covered stocks" },
            { label: "Quarterly margin trend", prompt: `Show ${tk}'s gross, operating and net margin for the last 8 quarters` },
          ]}
        />
      </Section>

      {/* Financial health */}
      <Section title="Financial health" caption="latest reported balance sheet">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatTile label="Cash" value={money(t.cash)} />
          <StatTile label="Total debt" value={money(t.totalDebt)} />
          <StatTile label="Equity" value={money(t.equity)} />
          <StatTile label="Current ratio" value={ratio(t.currentRatio)} />
        </div>
        <div>
          <div className="text-xs text-neutral-500 mb-1">Debt / equity by fiscal year</div>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={data.annual} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
              <XAxis dataKey="fiscalYear" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={45} tickFormatter={(v: number) => `${v.toFixed(1)}x`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [ratio(Number(v)), "debt / equity"]} />
              <Line isAnimationActive={false} type="monotone" dataKey="debtToEquity" name="Debt / equity" stroke="var(--viz-1)" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <FollowUps
          asks={[
            { label: "Debt vs peers", prompt: "Rank the covered stocks by debt to equity, least indebted first" },
            { label: "Cash & debt trend", prompt: `Show ${tk}'s cash and total debt over the last 5 years` },
          ]}
        />
      </Section>

      {/* Table twin of the annual charts */}
      <Section title="Annual figures">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
                <th className="py-1.5 pr-3 font-normal">FY</th>
                <th className="py-1.5 pr-3 font-normal text-right">Revenue</th>
                <th className="py-1.5 pr-3 font-normal text-right">Net income</th>
                <th className="py-1.5 pr-3 font-normal text-right">Net margin</th>
                <th className="py-1.5 pr-3 font-normal text-right">EPS</th>
                <th className="py-1.5 pr-3 font-normal text-right">FCF</th>
                <th className="py-1.5 font-normal text-right">Debt/eq</th>
              </tr>
            </thead>
            <tbody>
              {[...data.annual].reverse().map((r) => (
                <tr key={r.periodEnd} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-1.5 pr-3">{r.fiscalYear}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{money(r.revenue)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{money(r.netIncome)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{pct(r.netMarginPct)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{usd(r.dilutedEps)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{money(r.freeCashFlow)}</td>
                  <td className="py-1.5 text-right tabular-nums">{ratio(r.debtToEquity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <FollowUps
          asks={[
            { label: "Quarterly statements", prompt: `Show ${tk}'s quarterly fundamentals` },
            { label: "EPS trend", prompt: `Chart ${tk}'s diluted EPS over the last 5 years` },
            { label: "Free cash flow trend", prompt: `Chart ${tk}'s free cash flow over the last 5 years` },
          ]}
        />
      </Section>

      <p className="text-[11px] text-neutral-400">
        SEC filings + daily prices · TTM = trailing twelve months · scores are percentile ranks
        vs the {data.peersCount}-stock covered universe, not investment advice.
      </p>
    </div>
  );
}
