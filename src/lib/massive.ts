const BASE = "https://api.massive.com";
const MIN_INTERVAL_MS = 12_500; // free tier: 5 requests/minute

let lastCall = 0;

export async function throttledGet<T>(url: string): Promise<T | null> {
  const wait = lastCall + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  const key = process.env.MASSIVE_API_KEY;
  if (!key) throw new Error("MASSIVE_API_KEY is not set");
  const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}apiKey=${key}`);
  if (res.status === 404 || res.status === 400) return null;
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 60_000));
    return throttledGet(url);
  }
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

export interface MassiveTickerDetails {
  ticker: string;
  name: string;
  primary_exchange?: string;
  currency_name?: string;
  cik?: string;
  share_class_figi?: string;
  description?: string;
  sic_code?: string;
  sic_description?: string;
  homepage_url?: string;
  total_employees?: number;
  list_date?: string;
  active?: boolean;
}

export interface MassiveTickerEvent {
  type: string;
  date: string;
  ticker_change?: { ticker: string };
}

// SEC writes share classes as BRK-B; Massive expects BRK.B.
function toMassiveSymbol(ticker: string): string {
  return ticker.replace(/-([A-Z])$/, ".$1");
}

export async function fetchTickerDetails(ticker: string): Promise<MassiveTickerDetails | null> {
  const body = await throttledGet<{ results?: MassiveTickerDetails }>(
    `${BASE}/v3/reference/tickers/${encodeURIComponent(toMassiveSymbol(ticker))}`,
  );
  return body?.results ?? null;
}

export async function fetchTickerEvents(ticker: string): Promise<MassiveTickerEvent[]> {
  const body = await throttledGet<{ results?: { events?: MassiveTickerEvent[] } }>(
    `${BASE}/vX/reference/tickers/${encodeURIComponent(toMassiveSymbol(ticker))}/events?types=ticker_change`,
  );
  return body?.results?.events ?? [];
}
