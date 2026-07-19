import { queryRows } from "./clickhouse";
import { runMetricQuery } from "./metric-query";

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
// Home screen snapshot: one card per covered company (has fundamentals).

export interface HomeTicker {
  ticker: string;
  companyName: string;
  sector: string;
  closes: number[];
  lastClose: number;
  changePct: number | null; // null when only one sane price point exists
}

export async function homeSnapshot(): Promise<HomeTicker[]> {
  const rows = await queryRows<{ ticker: string; companyName: string; sector: string; date: string; close: number; symbolMatch: number }>(
    `SELECT s.ticker AS ticker, s.company_name AS companyName, s.sector AS sector,
            toString(p.trade_date) AS date, toFloat64(p.close) AS close,
            replaceAll(p.source_symbol, '.', '-') = upper(s.ticker) AS symbolMatch
     FROM daily_prices AS p FINAL
     INNER JOIN securities AS s FINAL
       ON s.security_id = p.security_id AND s.is_active
     WHERE p.security_id IN (SELECT DISTINCT security_id FROM financial_periods)
     ORDER BY ticker, p.trade_date`,
  );
  const byTicker = new Map<string, { companyName: string; sector: string; rows: { close: number; symbolMatch: number }[] }>();
  for (const r of rows) {
    if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, { companyName: r.companyName, sector: r.sector, rows: [] });
    byTicker.get(r.ticker)!.rows.push(r);
  }
  return [...byTicker.entries()]
    .map(([ticker, v]) => {
      const closes = sanePriceRows(v.rows).map((r) => r.close);
      return {
        ticker,
        companyName: v.companyName,
        sector: v.sector,
        closes,
        lastClose: closes[closes.length - 1],
        changePct: closes.length >= 2 ? (closes[closes.length - 1] / closes[0] - 1) * 100 : null,
      };
    })
    .filter((t) => t.closes.length >= 1)
    .sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));
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
  // The rest of the covered universe, sorted by market cap — for "compare
  // with" affordances in the widget.
  peerTickers: string[];
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

  const [rawPrices, annual, quarterly, snapshot] = await Promise.all([
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
        "revenue_growth_yoy", "eps_growth_yoy",
      ],
      period: "latest",
      limit: 50,
    }),
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
    peerTickers: [...peers]
      .sort((a, b) => (num(b.market_cap) ?? 0) - (num(a.market_cap) ?? 0))
      .map((r) => String(r.ticker))
      .filter((t) => t !== T),
  };
}
