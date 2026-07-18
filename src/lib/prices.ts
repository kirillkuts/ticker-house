import { throttledGet } from "./massive.js";

export interface GroupedDailyRow {
  T: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw?: number;
  n?: number;
  t: number;
}

export interface SplitEvent {
  ticker: string;
  execution_date: string;
  split_from: number;
  split_to: number;
}

export interface DividendEvent {
  ticker: string;
  ex_dividend_date: string;
  cash_amount: number;
  historical_adjustment_factor?: number;
}

const BASE = "https://api.massive.com";

export async function fetchGroupedDaily(date: string): Promise<GroupedDailyRow[]> {
  const body = await throttledGet<{ resultsCount: number; results?: GroupedDailyRow[] }>(
    `${BASE}/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=false`,
  );
  return body?.results ?? [];
}

async function fetchAllPages<T>(firstUrl: string): Promise<T[]> {
  const out: T[] = [];
  let url: string | undefined = firstUrl;
  while (url) {
    const body: { results?: T[]; next_url?: string } | null = await throttledGet(url);
    if (!body) break;
    out.push(...(body.results ?? []));
    url = body.next_url;
  }
  return out;
}

export function fetchSplits(from: string, to: string): Promise<SplitEvent[]> {
  return fetchAllPages<SplitEvent>(
    `${BASE}/stocks/v1/splits?execution_date.gte=${from}&execution_date.lte=${to}&limit=1000`,
  );
}

export function fetchDividends(from: string, to: string): Promise<DividendEvent[]> {
  return fetchAllPages<DividendEvent>(
    `${BASE}/stocks/v1/dividends?ex_dividend_date.gte=${from}&ex_dividend_date.lte=${to}&limit=1000`,
  );
}
