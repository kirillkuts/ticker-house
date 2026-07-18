import { queryRows } from "./clickhouse";

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
}

async function resolveSecurity(ticker: string) {
  const rows = await queryRows<{
    security_id: number;
    company_name: string;
    sector: string;
    industry: string;
  }>(
    `SELECT security_id, company_name, sector, industry
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

  const prices = await queryRows<PricePoint>(
    `SELECT toString(trade_date) AS date,
            toFloat64(open) AS open, toFloat64(high) AS high,
            toFloat64(low) AS low, toFloat64(close) AS close,
            toFloat64(volume) AS volume
     FROM daily_prices FINAL
     WHERE security_id = {sid:UInt32}
       AND trade_date >= today() - INTERVAL {days:UInt32} DAY
     ORDER BY trade_date`,
    { sid: sec.security_id, days: RANGES[range] },
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

  const rows = await queryRows<FundamentalsRow>(
    `SELECT toString(period_end) AS periodEnd,
            concat(fiscal_period, ' ', toString(fiscal_year)) AS fiscalLabel,
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
