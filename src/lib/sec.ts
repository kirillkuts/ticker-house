import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const UA = { "User-Agent": "TickerHouse kirill.kuts.dev@gmail.com" };

export interface SecTickerRow {
  cik: number;
  name: string;
  ticker: string;
  exchange: string;
}

export interface SecSubmissions {
  cik: string;
  name: string;
  sic: string;
  sicDescription: string;
  fiscalYearEnd: string;
  website: string;
  addresses?: {
    business?: { city?: string; stateOrCountry?: string };
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function saveRaw(date: string, name: string, data: unknown) {
  const dir = path.join("data", "raw", date);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), JSON.stringify(data));
}

export async function fetchSecTickerFile(): Promise<SecTickerRow[]> {
  const body = await fetchJson<{ fields: string[]; data: [number, string, string, string][] }>(
    "https://www.sec.gov/files/company_tickers_exchange.json",
  );
  return body.data.map(([cik, name, ticker, exchange]) => ({
    cik,
    name,
    ticker,
    exchange: exchange ?? "",
  }));
}

export async function fetchSecSubmissions(cik: number): Promise<SecSubmissions | null> {
  const padded = String(cik).padStart(10, "0");
  try {
    return await fetchJson<SecSubmissions>(`https://data.sec.gov/submissions/CIK${padded}.json`);
  } catch {
    return null;
  }
}
