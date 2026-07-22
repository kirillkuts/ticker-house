import { queryRows } from "./clickhouse";
import { runMetricQuery, type MetricQueryResult } from "./metric-query";
import { categoryBySlug, categorySlugOf } from "./categories";

export const RANGES = { "7d": 7, "1m": 31, "3m": 92, "1y": 365, "5y": 1826 } as const;
export type Range = keyof typeof RANGES;

export interface PricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SingleStockPriceData {
  ticker: string;
  companyName: string;
  sector: string;
  industry: string;
  range: Range;
  prices: PricePoint[];
  kpis: {
    high: number;
    low: number;
    avgVolume: number;
    changePct: number;
    lastClose: number;
  };
  // Whether this security is in the fundamentals universe — decides which
  // follow-up affordances the widget may offer.
  hasFundamentals: boolean;
}

// A security can carry price rows from several source symbols: old tickers
// (FB), sibling classes (GOOG) — and, via symbol reuse in the vendor feed,
// a DIFFERENT company entirely (rows under "FB" in 2026 are not Meta).
// Anchor on the median close of the rows whose symbol matches the ticker and
// drop rows more than 20% away; sibling classes pass, foreign companies don't.
function sanePriceRows<T extends { close: number; symbolMatch: number }>(rows: T[]): T[] {
  const matching = rows.filter((r) => r.symbolMatch).map((r) => r.close).sort((a, b) => a - b);
  if (matching.length === 0) return rows;
  const mid = matching.length % 2
    ? matching[(matching.length - 1) / 2]
    : (matching[matching.length / 2 - 1] + matching[matching.length / 2]) / 2;
  return rows.filter((r) => r.symbolMatch || Math.abs(r.close - mid) <= 0.2 * mid);
}

const SYMBOL_MATCH = `replaceAll(source_symbol, '.', '-') = {tk:String}`;

async function resolveSecurity(ticker: string) {
  const rows = await queryRows<{
    security_id: number;
    company_name: string;
    sector: string;
    industry: string;
    description: string;
    headquarters: string;
    website: string;
    employee_count: number;
  }>(
    `SELECT security_id, company_name, sector, industry,
            description, headquarters, website, employee_count
     FROM securities FINAL
     WHERE is_active AND upper(ticker) = upper({ticker:String})
     LIMIT 1`,
    { ticker },
  );
  return rows[0] ?? null;
}

export async function singleStockPrice(ticker: string, range: Range): Promise<SingleStockPriceData | { error: string }> {
  const sec = await resolveSecurity(ticker);
  if (!sec) return { error: `Unknown ticker: ${ticker}` };

  const [raw, funda] = await Promise.all([
    queryRows<PricePoint & { symbolMatch: number }>(
      `SELECT toString(trade_date) AS date,
              toFloat64(open) AS open, toFloat64(high) AS high,
              toFloat64(low) AS low, toFloat64(close) AS close,
              toFloat64(volume) AS volume,
              ${SYMBOL_MATCH} AS symbolMatch
       FROM daily_prices FINAL
       WHERE security_id = {sid:UInt32}
         AND trade_date >= today() - INTERVAL {days:UInt32} DAY
       ORDER BY trade_date`,
      { sid: sec.security_id, days: RANGES[range], tk: ticker.toUpperCase() },
    ),
    queryRows<{ n: number }>(
      `SELECT count() AS n FROM financial_periods WHERE security_id = {sid:UInt32}`,
      { sid: sec.security_id },
    ),
  ]);
  const prices = sanePriceRows(raw).map<PricePoint>(
    ({ date, open, high, low, close, volume }) => ({ date, open, high, low, close, volume }),
  );
  if (prices.length === 0) return { error: `No price data for ${ticker} in range ${range}` };

  const first = prices[0];
  const last = prices[prices.length - 1];
  return {
    ticker: ticker.toUpperCase(),
    companyName: sec.company_name,
    sector: sec.sector,
    industry: sec.industry,
    range,
    prices,
    kpis: {
      high: Math.max(...prices.map((p) => p.high)),
      low: Math.min(...prices.map((p) => p.low)),
      avgVolume: Math.round(prices.reduce((s, p) => s + p.volume, 0) / prices.length),
      changePct: (last.close / first.open - 1) * 100,
      lastClose: last.close,
    },
    hasFundamentals: Number(funda[0]?.n ?? 0) > 0,
  };
}

// Last close + change per watchlist symbol (task 044's show_watchlist). One
// query for all symbols; a symbol with no price rows comes back with nulls
// instead of being dropped, so the list always mirrors the watchlist.
export interface WatchlistQuote {
  symbol: string;
  companyName: string | null;
  lastClose: number | null;
  changePct: number | null;
}

export async function watchlistQuotes(symbols: string[]): Promise<WatchlistQuote[]> {
  if (symbols.length === 0) return [];
  const upper = symbols.map((s) => s.toUpperCase());
  const rows = await queryRows<{ symbol: string; companyName: string; close: number; symbolMatch: number }>(
    `SELECT upper(s.ticker) AS symbol, s.company_name AS companyName,
            toFloat64(p.close) AS close,
            replaceAll(p.source_symbol, '.', '-') = upper(s.ticker) AS symbolMatch
     FROM daily_prices AS p FINAL
     INNER JOIN securities AS s FINAL ON s.security_id = p.security_id AND s.is_active
     WHERE upper(s.ticker) IN ({symbols:Array(String)})
     ORDER BY symbol, p.trade_date`,
    { symbols: upper },
  );
  const bySymbol = new Map<string, { companyName: string; rows: { close: number; symbolMatch: number }[] }>();
  for (const r of rows) {
    if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, { companyName: r.companyName, rows: [] });
    bySymbol.get(r.symbol)!.rows.push(r);
  }
  return upper.map((symbol) => {
    const entry = bySymbol.get(symbol);
    const closes = entry ? sanePriceRows(entry.rows).map((r) => r.close) : [];
    return {
      symbol,
      companyName: entry?.companyName ?? null,
      lastClose: closes.length ? closes[closes.length - 1] : null,
      changePct: closes.length >= 2 ? (closes[closes.length - 1] / closes[0] - 1) * 100 : null,
    };
  });
}

export interface FundamentalsRow {
  periodEnd: string;
  fiscalLabel: string;
  revenue: number | null;
  netIncome: number | null;
  dilutedEps: number | null;
  freeCashFlow: number | null;
  netMarginPct: number | null;
}

export interface FundamentalsData {
  ticker: string;
  companyName: string;
  periodType: "quarter" | "annual";
  rows: FundamentalsRow[];
}

export async function fundamentals(
  ticker: string,
  periodType: "quarter" | "annual",
  limit = 8,
): Promise<FundamentalsData | { error: string }> {
  const sec = await resolveSecurity(ticker);
  if (!sec) return { error: `Unknown ticker: ${ticker}` };

  // fiscal_period/fiscal_year come from whichever filing (re)stated the
  // period, so restated quarters carry the restating filing's year — label
  // from period_end instead.
  const rows = await queryRows<FundamentalsRow>(
    `SELECT toString(period_end) AS periodEnd,
            if({pt:String} = 'annual',
               concat('FY', toString(toYear(period_end))),
               formatDateTime(period_end, '%b %Y')) AS fiscalLabel,
            toFloat64OrNull(toString(revenue)) AS revenue,
            toFloat64OrNull(toString(net_income)) AS netIncome,
            toFloat64OrNull(toString(diluted_eps)) AS dilutedEps,
            toFloat64OrNull(toString(free_cash_flow)) AS freeCashFlow,
            if(revenue IS NOT NULL AND revenue != 0,
               toFloat64(net_income) / toFloat64(revenue) * 100, NULL) AS netMarginPct
     FROM financial_periods FINAL
     WHERE security_id = {sid:UInt32} AND period_type = {pt:String}
     ORDER BY period_end DESC
     LIMIT {lim:UInt32}`,
    { sid: sec.security_id, pt: periodType, lim: limit },
  );
  if (rows.length === 0) return { error: `No fundamentals loaded for ${ticker}` };
  return { ticker: ticker.toUpperCase(), companyName: sec.company_name, periodType, rows: rows.reverse() };
}

// ---------------------------------------------------------------------------
// Expense breakdown: where the revenue goes, line by line.

export interface ExpensePeriodRow {
  periodEnd: string;
  fiscalLabel: string;
  revenue: number | null;
  costOfRevenue: number | null;
  researchAndDevelopment: number | null;
  sellingAndMarketing: number | null;
  generalAndAdmin: number | null;
  sellingGeneralAdmin: number | null; // combined SG&A — the fallback when the split is not reported
  otherOperating: number | null; // derived remainder between gross profit and operating income
  operatingIncome: number | null;
  opMarginPct: number | null;
  depreciationAmortization: number | null;
  shareBasedCompensation: number | null;
}

export interface ExpenseBreakdownData {
  ticker: string;
  companyName: string;
  periodType: "quarter" | "annual";
  // True when the company reports selling/marketing and G&A separately.
  hasSplit: boolean;
  rows: ExpensePeriodRow[];
}

export async function expenseBreakdown(
  ticker: string,
  periodType: "quarter" | "annual",
  limit = 8,
): Promise<ExpenseBreakdownData | { error: string }> {
  const sec = await resolveSecurity(ticker);
  if (!sec) return { error: `Unknown ticker: ${ticker}` };

  const f = (col: string) => `toFloat64OrNull(toString(${col}))`;
  const rows = await queryRows<Omit<ExpensePeriodRow, "otherOperating">>(
    `SELECT toString(period_end) AS periodEnd,
            if({pt:String} = 'annual',
               concat('FY', toString(toYear(period_end))),
               formatDateTime(period_end, '%b %Y')) AS fiscalLabel,
            ${f("revenue")} AS revenue,
            ${f("cost_of_revenue")} AS costOfRevenue,
            ${f("research_and_development")} AS researchAndDevelopment,
            ${f("selling_and_marketing")} AS sellingAndMarketing,
            ${f("general_and_admin")} AS generalAndAdmin,
            ${f("selling_general_admin")} AS sellingGeneralAdmin,
            ${f("operating_income")} AS operatingIncome,
            if(revenue IS NOT NULL AND revenue != 0 AND operating_income IS NOT NULL,
               toFloat64(operating_income) / toFloat64(revenue) * 100, NULL) AS opMarginPct,
            ${f("depreciation_amortization")} AS depreciationAmortization,
            ${f("share_based_compensation")} AS shareBasedCompensation
     FROM financial_periods FINAL
     WHERE security_id = {sid:UInt32} AND period_type = {pt:String}
     ORDER BY period_end DESC
     LIMIT {lim:UInt32}`,
    { sid: sec.security_id, pt: periodType, lim: limit },
  );
  if (rows.length === 0) return { error: `No fundamentals loaded for ${ticker}` };

  const hasSplit = rows.some((r) => r.sellingAndMarketing !== null && r.generalAndAdmin !== null);
  const full: ExpensePeriodRow[] = rows.map((r) => {
    const sgna = hasSplit && r.sellingAndMarketing !== null && r.generalAndAdmin !== null
      ? r.sellingAndMarketing + r.generalAndAdmin
      : r.sellingGeneralAdmin;
    const other =
      r.revenue !== null && r.costOfRevenue !== null && r.operatingIncome !== null && sgna !== null
        ? r.revenue - r.costOfRevenue - (r.researchAndDevelopment ?? 0) - sgna - r.operatingIncome
        : null;
    return { ...r, otherOperating: other };
  });

  // Nothing below the revenue line means the composition view can't say
  // anything (banks/insurers) — steer to the plain fundamentals view instead.
  const anyExpenseLine = full.some(
    (r) => r.costOfRevenue !== null || r.researchAndDevelopment !== null ||
           r.sellingAndMarketing !== null || r.generalAndAdmin !== null || r.sellingGeneralAdmin !== null,
  );
  if (!anyExpenseLine)
    return { error: `${ticker.toUpperCase()} doesn't report standard operating expense lines (financial-sector statements). Use show_fundamentals instead.` };

  return { ticker: ticker.toUpperCase(), companyName: sec.company_name, periodType, hasSplit, rows: full.reverse() };
}

// ---------------------------------------------------------------------------
// Segment breakdown: revenue / operating income by business segment + geography.

export interface SegmentSeries {
  member: string;
  label: string;
  revenue: (number | null)[]; // aligned to years
  opIncome: (number | null)[];
}

export interface SegmentBreakdownData {
  ticker: string;
  companyName: string;
  // TSLA-style filers report their split on the product axis instead of the
  // business-segments axis; the widget presents both as "segments".
  axisUsed: "business" | "product";
  years: string[]; // e.g. "FY2025", oldest first
  segments: SegmentSeries[];
  geography: { member: string; label: string; revenue: (number | null)[] }[];
  // Product / service revenue split, shown in addition to the segments when
  // the reportable segments themselves are regions (AAPL: segments = Americas,
  // Europe… while products = iPhone, Mac, Services…). Empty otherwise.
  products: { member: string; label: string; revenue: (number | null)[] }[];
  singleSegment: boolean;
  // False when members still sum to well over consolidated revenue (BRK-style
  // tagging) — stacking would misrepresent the total, render grouped bars.
  stackable: boolean;
}

const REV_PRIORITY = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "Revenues",
  "SalesRevenueNet",
];

// Filings sometimes carry glued camel-case names, in the label field too
// ("EMEASegment", "FamilyOfApps"). Split at case boundaries — but only after
// a 2+ capital run for the CAPS→Word rule, so "IPhone" stays intact.
const humanizeMember = (m: string) =>
  m.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]{2,})([A-Z][a-z])/g, "$1 $2");
const MAX_SEGMENTS = 7; // fixed-order palette has 8 hues; the rest folds into "Other"

// Some filers tag parent aggregates alongside the leaves on the same axis
// (TSLA: "Sales And Services" ⊃ "Automotive Revenues" ⊃ "Automotive Sales";
// AAPL products: "Product" ⊃ iPhone/Mac/iPad/Wearables), which would
// double-count in a stack. While the members overshoot the consolidated
// total, remove any member that equals the sum of a subset of the others —
// that is what makes something a parent, not its size.
function pruneParentAggregates(members: string[], val: (m: string) => number, total: number | undefined): string[] {
  if (!total) return members;
  const isSubsetSum = (vals: number[], target: number, tol: number, picked = 0, from = 0): boolean => {
    if (picked >= 2 && Math.abs(target) <= tol) return true;
    if (from >= vals.length || target < -tol) return false;
    return isSubsetSum(vals, target - vals[from], tol, picked + 1, from + 1) ||
           isSubsetSum(vals, target, tol, picked, from + 1);
  };
  let out = members;
  while (out.length > 2 && out.reduce((s, m) => s + val(m), 0) > 1.05 * total) {
    const aggregate = out.find((m) => {
      const target = val(m);
      if (target <= 0) return false;
      const others = out.filter((x) => x !== m).map(val).filter((v) => v > 0).sort((a, b) => b - a);
      return isSubsetSum(others, target, 0.005 * target);
    });
    if (!aggregate) break; // no detectable parent — leave the data as reported
    out = out.filter((m) => m !== aggregate);
  }
  return out;
}

export async function segmentBreakdown(ticker: string): Promise<SegmentBreakdownData | { error: string }> {
  const sec = await resolveSecurity(ticker);
  if (!sec) return { error: `Unknown ticker: ${ticker}` };

  const [facts, consolidated] = await Promise.all([
    queryRows<{
      axis: string; member: string; label: string; concept: string; periodEnd: string; value: number;
    }>(
      `SELECT axis, member, member_label AS label, concept,
              toString(period_end) AS periodEnd, toFloat64(value) AS value
       FROM financial_segments FINAL
       WHERE security_id = {sid:UInt32} AND qtrs = 4
       ORDER BY period_end`,
      { sid: sec.security_id },
    ),
    queryRows<{ periodEnd: string; revenue: number }>(
      `SELECT toString(period_end) AS periodEnd, toFloat64(revenue) AS revenue
       FROM financial_periods FINAL
       WHERE security_id = {sid:UInt32} AND period_type = 'annual' AND revenue IS NOT NULL`,
      { sid: sec.security_id },
    ),
  ]);
  // Keyed by year-month: FSDS rounds period ends to month end (2025-09-30)
  // while financial_periods keeps the real fiscal date (AAPL: 2025-09-27), so
  // exact-date joins silently miss and disable the parent-aggregate pruning.
  const totalRevenue = new Map(consolidated.map((r) => [r.periodEnd.slice(0, 7), r.revenue]));
  if (facts.length === 0)
    return { error: `No segment data loaded for ${ticker} — the company may report a single segment, or segment ingestion doesn't cover it.` };

  const axisUsed: "business" | "product" = facts.some((r) => r.axis === "business") ? "business" : "product";

  // One revenue number per (member, period): highest-priority concept wins.
  const pickRevenue = (rows: typeof facts) => {
    const best = new Map<string, { rank: number; value: number }>();
    for (const r of rows) {
      const rank = REV_PRIORITY.indexOf(r.concept);
      if (rank === -1) continue;
      const key = `${r.member}|${r.periodEnd}`;
      const prev = best.get(key);
      if (!prev || rank < prev.rank) best.set(key, { rank, value: r.value });
    }
    return best;
  };

  const segFacts = facts.filter((r) => r.axis === axisUsed);
  const segRevenue = pickRevenue(segFacts);
  const segOpIncome = new Map(
    segFacts.filter((r) => r.concept === "OperatingIncomeLoss").map((r) => [`${r.member}|${r.periodEnd}`, r.value]),
  );

  // Last 5 fiscal years that have any segment revenue.
  const periodEnds = [...new Set([...segRevenue.keys()].map((k) => k.split("|")[1]))].sort().slice(-5);
  if (periodEnds.length === 0)
    return { error: `No segment revenue data for ${ticker} (only balance-sheet segment facts are available).` };
  const years = periodEnds.map((pe) => `FY${pe.slice(0, 4)}`);

  const labelOf = new Map(segFacts.map((r) => [r.member, humanizeMember(r.label || r.member)]));
  const latest = periodEnds[periodEnds.length - 1];
  let members = [...new Set([...segRevenue.keys()].map((k) => k.split("|")[0]))]
    .sort((a, b) => (segRevenue.get(`${b}|${latest}`)?.value ?? 0) - (segRevenue.get(`${a}|${latest}`)?.value ?? 0));

  const latestTotal = totalRevenue.get(latest.slice(0, 7));
  members = pruneParentAggregates(members, (m) => segRevenue.get(`${m}|${latest}`)?.value ?? 0, latestTotal);
  const latestSum = members.reduce((s, m) => s + (segRevenue.get(`${m}|${latest}`)?.value ?? 0), 0);
  const stackable = !latestTotal || latestSum <= 1.1 * latestTotal;

  const series = (member: string): SegmentSeries => ({
    member,
    label: labelOf.get(member) ?? humanizeMember(member),
    revenue: periodEnds.map((pe) => segRevenue.get(`${member}|${pe}`)?.value ?? null),
    opIncome: periodEnds.map((pe) => segOpIncome.get(`${member}|${pe}`) ?? null),
  });
  const head = members.slice(0, MAX_SEGMENTS).map(series);
  const tail = members.slice(MAX_SEGMENTS).map(series);
  const sumRow = (xs: (number | null)[][], i: number): number | null => {
    const vals = xs.map((s) => s[i]).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const segments = tail.length === 0 ? head : [
    ...head,
    {
      member: "__other__",
      label: `Other (${tail.length})`,
      revenue: periodEnds.map((_, i) => sumRow(tail.map((s) => s.revenue), i)),
      opIncome: periodEnds.map((_, i) => sumRow(tail.map((s) => s.opIncome), i)),
    },
  ];

  const geoRevenue = pickRevenue(facts.filter((r) => r.axis === "geography"));
  const geoLabelOf = new Map(facts.filter((r) => r.axis === "geography").map((r) => [r.member, humanizeMember(r.label || r.member)]));
  let geoMembers = [...new Set([...geoRevenue.keys()].map((k) => k.split("|")[0]))]
    .sort((a, b) => (geoRevenue.get(`${b}|${latest}`)?.value ?? 0) - (geoRevenue.get(`${a}|${latest}`)?.value ?? 0));
  // Filers often add ISO-country facts (US, CN) on top of their own region
  // members (USCanada, Europe); countries are subsets of regions and would
  // double-count in the stack. Keep the regions when both kinds exist — but
  // only if the regions alone still cover the total. AAPL's geography axis is
  // US + CN + OtherCountries (the countries ARE the partition); dropping them
  // there would leave a lone "OtherCountries" bar.
  const geoVal = (m: string) => geoRevenue.get(`${m}|${latest}`)?.value ?? 0;
  const isCountry = (m: string) => /^[A-Z]{2}$/.test(m);
  if (geoMembers.some(isCountry) && geoMembers.some((m) => !isCountry(m))) {
    const regionsOnly = geoMembers.filter((m) => !isCountry(m));
    const covers = !latestTotal || regionsOnly.reduce((s, m) => s + geoVal(m), 0) >= 0.8 * latestTotal;
    if (covers) geoMembers = regionsOnly;
  }
  geoMembers = pruneParentAggregates(geoMembers, geoVal, latestTotal).slice(0, MAX_SEGMENTS + 1);
  const geography = geoMembers.map((m) => ({
    member: m,
    label: geoLabelOf.get(m) ?? humanizeMember(m),
    revenue: periodEnds.map((pe) => geoRevenue.get(`${m}|${pe}`)?.value ?? null),
  }));

  // Product / service split, surfaced when the reportable segments are NOT
  // already the product axis (AAPL: segments are regions; the product axis is
  // where iPhone / Mac / Services live). Parent aggregates ("Product" =
  // iPhone + Mac + iPad + Wearables) are pruned the same way as segments.
  let products: SegmentBreakdownData["products"] = [];
  if (axisUsed === "business") {
    const prodRevenue = pickRevenue(facts.filter((r) => r.axis === "product"));
    const prodLabelOf = new Map(facts.filter((r) => r.axis === "product").map((r) => [r.member, humanizeMember(r.label || r.member)]));
    let prodMembers = [...new Set([...prodRevenue.keys()].map((k) => k.split("|")[0]))]
      .sort((a, b) => (prodRevenue.get(`${b}|${latest}`)?.value ?? 0) - (prodRevenue.get(`${a}|${latest}`)?.value ?? 0));
    prodMembers = pruneParentAggregates(
      prodMembers, (m) => prodRevenue.get(`${m}|${latest}`)?.value ?? 0, latestTotal,
    ).slice(0, MAX_SEGMENTS + 1);
    if (prodMembers.length >= 2)
      products = prodMembers.map((m) => ({
        member: m,
        label: prodLabelOf.get(m) ?? humanizeMember(m),
        revenue: periodEnds.map((pe) => prodRevenue.get(`${m}|${pe}`)?.value ?? null),
      }));
  }

  return {
    ticker: ticker.toUpperCase(),
    companyName: sec.company_name,
    axisUsed,
    years,
    segments,
    geography,
    products,
    singleSegment: segments.length <= 1,
    stackable,
  };
}

// ---------------------------------------------------------------------------
// Home screen snapshot: one card per covered company (has fundamentals).

export interface HomeTicker {
  ticker: string;
  companyName: string;
  sector: string;
  industry: string;
  closes: number[];
  lastClose: number;
  changePct: number | null; // null when only one sane price point exists
  revenueTtm: number | null; // for the "Top revenue" sort on the home grid
}

export async function homeSnapshot(): Promise<HomeTicker[]> {
  const [rows, revSnapshot] = await Promise.all([
    queryRows<{ ticker: string; companyName: string; sector: string; industry: string; date: string; close: number; symbolMatch: number }>(
      `SELECT s.ticker AS ticker, s.company_name AS companyName, s.sector AS sector, s.industry AS industry,
              toString(p.trade_date) AS date, toFloat64(p.close) AS close,
              replaceAll(p.source_symbol, '.', '-') = upper(s.ticker) AS symbolMatch
       FROM daily_prices AS p FINAL
       INNER JOIN securities AS s FINAL
         ON s.security_id = p.security_id AND s.is_active
       WHERE p.security_id IN (SELECT DISTINCT security_id FROM financial_periods)
       ORDER BY ticker, p.trade_date`,
    ),
    // TTM revenue per ticker (last 4 quarters), for the "Top revenue" sort.
    // Queried directly: runMetricQuery caps at 50 rows, fewer than the universe.
    queryRows<{ ticker: string; revenueTtm: number }>(
      `SELECT s.ticker AS ticker, sum(toFloat64OrNull(toString(fp.revenue))) AS revenueTtm
       FROM (
         SELECT security_id, revenue,
                row_number() OVER (PARTITION BY security_id ORDER BY period_end DESC) AS rn
         FROM financial_periods FINAL
         WHERE period_type = 'quarter' AND revenue IS NOT NULL
       ) AS fp
       INNER JOIN securities AS s FINAL ON s.security_id = fp.security_id AND s.is_active
       WHERE fp.rn <= 4
       GROUP BY ticker`,
    ),
  ]);
  const revenueOf = new Map<string, number | null>(revSnapshot.map((r) => [r.ticker, r.revenueTtm]));
  const byTicker = new Map<string, { companyName: string; sector: string; industry: string; rows: { close: number; symbolMatch: number }[] }>();
  for (const r of rows) {
    if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, { companyName: r.companyName, sector: r.sector, industry: r.industry, rows: [] });
    byTicker.get(r.ticker)!.rows.push(r);
  }
  return [...byTicker.entries()]
    .map(([ticker, v]) => {
      const closes = sanePriceRows(v.rows).map((r) => r.close);
      return {
        ticker,
        companyName: v.companyName,
        sector: v.sector,
        industry: v.industry,
        closes,
        lastClose: closes[closes.length - 1],
        changePct: closes.length >= 2 ? (closes[closes.length - 1] / closes[0] - 1) * 100 : null,
        revenueTtm: revenueOf.get(ticker) ?? null,
      };
    })
    .filter((t) => t.closes.length >= 1)
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}

// ---------------------------------------------------------------------------
// Company overview: the "everything about one stock" dashboard.

export interface OverviewScore {
  axis: string;
  score: number | null; // 0..5, percentile-based vs the covered universe
  detail: string;
}

export interface OverviewAnnualRow {
  periodEnd: string;
  fiscalYear: string;
  revenue: number | null;
  netIncome: number | null;
  grossMarginPct: number | null;
  opMarginPct: number | null;
  netMarginPct: number | null;
  dilutedEps: number | null;
  freeCashFlow: number | null;
  equity: number | null;
  totalDebt: number | null;
  cash: number | null;
  debtToEquity: number | null;
}

export interface OverviewQuarterRow {
  periodEnd: string;
  fiscalLabel: string;
  revenue: number | null;
  netIncome: number | null;
}

export interface OverviewTtm {
  marketCap: number | null;
  peTtm: number | null;
  psTtm: number | null;
  revenue: number | null;
  netIncome: number | null;
  eps: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  roe: number | null;
  roa: number | null;
  freeCashFlow: number | null;
  fcfMargin: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  cash: number | null;
  totalDebt: number | null;
  equity: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  revenueGrowthYoy: number | null;
  epsGrowthYoy: number | null;
}

export interface CompanyOverviewData {
  ticker: string;
  companyName: string;
  sector: string;
  industry: string;
  about: {
    description: string;
    headquarters: string;
    website: string;
    employees: number | null;
  };
  priceWindow: { from: string; to: string };
  prices: { date: string; close: number }[];
  kpis: { lastClose: number; changePct: number | null; high: number; low: number };
  ttm: OverviewTtm;
  scores: OverviewScore[];
  valuation: { metric: string; company: number | null; peerMedian: number | null }[];
  annual: OverviewAnnualRow[];
  quarterly: OverviewQuarterRow[];
  peersCount: number;
  // The rest of the covered universe, sorted by market cap — the full set
  // behind the "Compare vs…" search box.
  peerTickers: string[];
  // Relevant peers for the default chip list, sorted by market cap: same
  // task-031 category, or same SEC sector when the industry is uncategorised.
  sectorPeers: string[];
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Fraction of peers this value beats (ties count half). dir "low" = lower is better.
function pctRank(values: (number | null)[], v: number | null, dir: "high" | "low"): number | null {
  const vals = values.filter((x): x is number => x !== null);
  if (v === null || vals.length < 3) return null;
  const below = vals.filter((x) => x < v).length;
  const eq = vals.filter((x) => x === v).length;
  const p = (below + eq / 2) / vals.length;
  return dir === "high" ? p : 1 - p;
}

const meanOrNull = (xs: (number | null)[]): number | null => {
  const vals = xs.filter((x): x is number => x !== null);
  return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
};

const round1 = (x: number | null): number | null => (x === null ? null : Math.round(x * 10) / 10);

export async function companyOverview(ticker: string): Promise<CompanyOverviewData | { error: string }> {
  const sec = await resolveSecurity(ticker);
  if (!sec) return { error: `Unknown ticker: ${ticker}` };

  const f = (col: string) => `toFloat64OrNull(toString(${col}))`;
  const marginPct = (n: string, d: string) =>
    `if(${d} IS NOT NULL AND ${d} != 0, toFloat64(${n}) / toFloat64(${d}) * 100, NULL)`;

  const [rawPrices, annual, quarterly, snapshot, securityMeta] = await Promise.all([
    queryRows<{ date: string; close: number; symbolMatch: number }>(
      `SELECT toString(trade_date) AS date, toFloat64(close) AS close,
              ${SYMBOL_MATCH} AS symbolMatch
       FROM daily_prices FINAL
       WHERE security_id = {sid:UInt32}
       ORDER BY trade_date`,
      { sid: sec.security_id, tk: ticker.toUpperCase() },
    ),
    // fiscal_year is stamped by the restating filing and unreliable; label
    // periods from period_end.
    queryRows<OverviewAnnualRow>(
      `SELECT toString(period_end) AS periodEnd,
              toString(toYear(period_end)) AS fiscalYear,
              ${f("revenue")} AS revenue,
              ${f("net_income")} AS netIncome,
              ${marginPct("gross_profit", "revenue")} AS grossMarginPct,
              ${marginPct("operating_income", "revenue")} AS opMarginPct,
              ${marginPct("net_income", "revenue")} AS netMarginPct,
              ${f("diluted_eps")} AS dilutedEps,
              ${f("free_cash_flow")} AS freeCashFlow,
              ${f("shareholders_equity")} AS equity,
              ${f("total_debt")} AS totalDebt,
              ${f("cash_and_equivalents")} AS cash,
              if(shareholders_equity IS NOT NULL AND shareholders_equity != 0,
                 toFloat64(total_debt) / toFloat64(shareholders_equity), NULL) AS debtToEquity
       FROM financial_periods FINAL
       WHERE security_id = {sid:UInt32} AND period_type = 'annual'
       ORDER BY period_end DESC
       LIMIT 12`,
      { sid: sec.security_id },
    ),
    queryRows<OverviewQuarterRow>(
      `SELECT toString(period_end) AS periodEnd,
              formatDateTime(period_end, '%b %Y') AS fiscalLabel,
              ${f("revenue")} AS revenue,
              ${f("net_income")} AS netIncome
       FROM financial_periods FINAL
       WHERE security_id = {sid:UInt32} AND period_type = 'quarter'
       ORDER BY period_end DESC
       LIMIT 8`,
      { sid: sec.security_id },
    ),
    runMetricQuery({
      metrics: [
        "market_cap", "pe_ttm", "ps_ttm", "revenue", "net_income", "eps",
        "gross_margin", "operating_margin", "net_margin", "roe", "roa",
        "free_cash_flow", "operating_cash_flow", "debt_to_equity", "current_ratio",
        "cash_and_equivalents", "total_debt", "shareholders_equity",
        "total_assets", "total_liabilities",
        "revenue_growth_yoy", "eps_growth_yoy",
      ],
      period: "latest",
      // The percentile scores rank against the whole covered universe, and a
      // company outside the snapshot can't render at all — never truncate.
      limit: 500,
    }),
    // Ticker → SEC sector/industry for the whole active universe, so peers can
    // be bucketed into the same category (task 031) — or the same coarse sector
    // when the industry maps to no category — as the current company.
    queryRows<{ ticker: string; sector: string; industry: string }>(
      `SELECT upper(ticker) AS ticker, sector, industry FROM securities FINAL WHERE is_active`,
    ),
  ]);

  if ("error" in snapshot) return { error: `Metric snapshot failed: ${snapshot.error}` };
  if (annual.length === 0)
    return { error: `No fundamentals loaded for ${ticker} — outside the covered universe. Use show_price_chart for price-only data.` };
  const prices = sanePriceRows(rawPrices).map(({ date, close }) => ({ date, close }));
  if (prices.length === 0) return { error: `No price data for ${ticker}` };

  const T = ticker.toUpperCase();
  const me = snapshot.rows.find((r) => String(r.ticker) === T);
  if (!me)
    return { error: `No TTM metrics for ${ticker} — outside the covered universe. Use show_price_chart for price-only data.` };

  // Derived per-peer columns for scoring.
  type PeerRow = Record<string, string | number | null>;
  const peers: PeerRow[] = snapshot.rows.map((r) => {
    const rev = num(r.revenue);
    const fcf = num(r.free_cash_flow);
    const ocf = num(r.operating_cash_flow);
    return {
      ...r,
      fcf_margin: rev && fcf !== null ? (fcf / rev) * 100 : null,
      ocf_margin: rev && ocf !== null ? (ocf / rev) * 100 : null,
    };
  });
  const mine = peers.find((r) => String(r.ticker) === T)!;
  const col = (key: string) => peers.map((r) => num(r[key]));
  const rank = (key: string, dir: "high" | "low") => pctRank(col(key), num(mine[key]), dir);

  const fmtPct = (v: number | null) => (v === null ? "n/a" : `${v.toFixed(1)}%`);
  const fmtX = (v: number | null) => (v === null ? "n/a" : `${v.toFixed(1)}x`);
  const fmtSigned = (v: number | null) => (v === null ? "n/a" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

  const pe = num(mine.pe_ttm);
  const ps = num(mine.ps_ttm);
  const peMedian = median(col("pe_ttm").filter((x): x is number => x !== null));
  const psMedian = median(col("ps_ttm").filter((x): x is number => x !== null));

  // A 0..5 score = mean of the available percentile ranks, scaled.
  const scoreOf = (ranks: (number | null)[]): number | null => {
    const m = meanOrNull(ranks);
    return m === null ? null : round1(m * 5);
  };

  const scores: OverviewScore[] = [
    {
      axis: "Value",
      score: scoreOf([rank("pe_ttm", "low"), rank("ps_ttm", "low")]),
      detail: `P/E ${fmtX(pe)} vs peer median ${fmtX(peMedian)} · P/S ${fmtX(ps)}`,
    },
    {
      axis: "Growth",
      score: scoreOf([rank("revenue_growth_yoy", "high"), rank("eps_growth_yoy", "high")]),
      detail: `Revenue ${fmtSigned(num(mine.revenue_growth_yoy))} YoY · EPS ${fmtSigned(num(mine.eps_growth_yoy))} YoY`,
    },
    {
      axis: "Profitability",
      score: scoreOf([
        rank("gross_margin", "high"), rank("operating_margin", "high"),
        rank("net_margin", "high"), rank("roe", "high"),
      ]),
      detail: `Net margin ${fmtPct(num(mine.net_margin))} · ROE ${fmtPct(num(mine.roe))}`,
    },
    {
      axis: "Health",
      score: scoreOf([rank("debt_to_equity", "low"), rank("current_ratio", "high")]),
      detail: `Debt/equity ${fmtX(num(mine.debt_to_equity))} · current ratio ${fmtX(num(mine.current_ratio))}`,
    },
    {
      axis: "Cash flow",
      score: scoreOf([rank("fcf_margin", "high"), rank("ocf_margin", "high")]),
      detail: `Free cash flow is ${fmtPct(num(mine.fcf_margin))} of revenue`,
    },
  ];

  const first = prices[0];
  const last = prices[prices.length - 1];
  const rev = num(mine.revenue);
  const fcf = num(mine.free_cash_flow);

  // Covered universe minus self, sorted by market cap: the full "Compare vs…"
  // list. A short relevant subset gets pulled out as the default chip set.
  const metaOf = new Map(securityMeta.map((r) => [String(r.ticker).toUpperCase(), r]));
  const mySlug = categorySlugOf(T, sec.industry);
  const peerTickers = [...peers]
    .sort((a, b) => (num(b.market_cap) ?? 0) - (num(a.market_cap) ?? 0))
    .map((r) => String(r.ticker))
    .filter((t) => t !== T);
  const sameCategory = mySlug
    ? peerTickers.filter((t) => categorySlugOf(t, metaOf.get(t)?.industry ?? "") === mySlug)
    : [];
  // Prefer the task-031 category grouping; fall back to the coarse SEC sector
  // when the industry maps to no category, so companies like BX (industry
  // "Investment Advice", uncategorised) still show financial peers rather than
  // the market-cap leaderboard.
  const sectorPeers = sameCategory.length
    ? sameCategory
    : sec.sector
      ? peerTickers.filter((t) => (metaOf.get(t)?.sector ?? "") === sec.sector)
      : [];

  return {
    ticker: T,
    companyName: sec.company_name,
    sector: sec.sector,
    industry: sec.industry,
    about: {
      description: sec.description,
      headquarters: sec.headquarters,
      website: sec.website,
      employees: sec.employee_count > 0 ? sec.employee_count : null,
    },
    priceWindow: { from: first.date, to: last.date },
    prices,
    kpis: {
      lastClose: last.close,
      changePct: prices.length >= 2 ? (last.close / first.close - 1) * 100 : null,
      high: Math.max(...prices.map((p) => p.close)),
      low: Math.min(...prices.map((p) => p.close)),
    },
    ttm: {
      marketCap: num(mine.market_cap),
      peTtm: pe,
      psTtm: ps,
      revenue: rev,
      netIncome: num(mine.net_income),
      eps: num(mine.eps),
      grossMargin: num(mine.gross_margin),
      operatingMargin: num(mine.operating_margin),
      netMargin: num(mine.net_margin),
      roe: num(mine.roe),
      roa: num(mine.roa),
      freeCashFlow: fcf,
      fcfMargin: num(mine.fcf_margin),
      debtToEquity: num(mine.debt_to_equity),
      currentRatio: num(mine.current_ratio),
      cash: num(mine.cash_and_equivalents),
      totalDebt: num(mine.total_debt),
      equity: num(mine.shareholders_equity),
      totalAssets: num(mine.total_assets),
      totalLiabilities: num(mine.total_liabilities),
      revenueGrowthYoy: num(mine.revenue_growth_yoy),
      epsGrowthYoy: num(mine.eps_growth_yoy),
    },
    scores,
    valuation: [
      { metric: "P/E (TTM)", company: pe, peerMedian: peMedian },
      { metric: "P/S (TTM)", company: ps, peerMedian: psMedian },
    ],
    annual: annual.reverse(),
    quarterly: quarterly.reverse(),
    peersCount: peers.length,
    peerTickers,
    sectorPeers,
  };
}

// ---------------------------------------------------------------------------
// Category page: one curated group of covered companies (task 031).

export interface CategorySnapshot {
  slug: string;
  name: string;
  blurb: string;
  members: HomeTicker[]; // A–Z
  aggregates: {
    count: number;
    marketCapTotal: number | null;
    marketCapMedian: number | null;
    avgChangePct: number | null; // two-week move, mean over members that have one
    revenueLeaders: { ticker: string; revenue: number }[]; // top 3 by TTM revenue
  };
  // Cross-member comparison (market cap, P/E, net margin, revenue, growth),
  // shaped exactly like a query_metrics result so MetricResult renders it.
  metrics: MetricQueryResult | null;
}

export async function categorySnapshot(slug: string): Promise<CategorySnapshot | null> {
  const cat = categoryBySlug.get(slug);
  if (!cat) return null;
  const home = await homeSnapshot();
  const members = home.filter((t) => categorySlugOf(t.ticker, t.industry) === slug);
  if (members.length === 0) return null;

  const result = await runMetricQuery({
    metrics: ["market_cap", "pe_ttm", "net_margin", "revenue", "revenue_growth_yoy"],
    tickers: members.map((m) => m.ticker).slice(0, 50),
    period: "latest",
    sort: { field: "market_cap", dir: "desc" },
    limit: 50,
  });
  const metrics = "error" in result ? null : result;

  const caps = (metrics?.rows ?? []).map((r) => num(r.market_cap)).filter((v): v is number => v !== null);
  const changes = members.map((m) => m.changePct).filter((v): v is number => v !== null);
  const revenueLeaders = [...members]
    .filter((m): m is HomeTicker & { revenueTtm: number } => m.revenueTtm !== null)
    .sort((a, b) => b.revenueTtm - a.revenueTtm)
    .slice(0, 3)
    .map((m) => ({ ticker: m.ticker, revenue: m.revenueTtm }));

  return {
    slug,
    name: cat.name,
    blurb: cat.blurb,
    members,
    aggregates: {
      count: members.length,
      marketCapTotal: caps.length ? caps.reduce((a, b) => a + b, 0) : null,
      marketCapMedian: median(caps),
      avgChangePct: changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null,
      revenueLeaders,
    },
    metrics,
  };
}
