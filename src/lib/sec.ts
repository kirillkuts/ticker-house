import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const UA = { "User-Agent": "TickerHouse kirill.kuts.dev@gmail.com" };

export interface SecTickerRow {
  cik: number;
  name: string;
  ticker: string;
  exchange: string;
}

// filings.recent is column-oriented: parallel arrays, index i = one filing.
export interface SecRecentFilings {
  accessionNumber: string[];
  filingDate: string[];
  form: string[];
  items: string[];
  primaryDocument: string[];
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
  filings?: { recent?: SecRecentFilings };
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

export function filingDocumentUrl(cik: number, accession: string, primaryDocument: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, "")}/${primaryDocument}`;
}

/** Fetch a filing's primary document (HTML or text). Null on any failure. */
export async function fetchFilingDocument(cik: number, accession: string, primaryDocument: string): Promise<string | null> {
  try {
    const res = await fetch(filingDocumentUrl(cik, accession, primaryDocument), { headers: UA });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
