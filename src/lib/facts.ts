import { ALL_CONCEPTS } from "./concepts.js";

export interface RawFact {
  concept: string;
  unit: string;
  value: number;
  period_start: string | null;
  period_end: string;
  filed_date: string;
  form: string;
  fiscal_year: number;
  fiscal_period: string;
  frame: string;
  accession: string;
  is_amendment: boolean;
}

interface SecFact {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number;
  fp?: string;
  form: string;
  filed: string;
  frame?: string;
}

const UA = { "User-Agent": "TickerHouse kirill.kuts.dev@gmail.com" };

export async function fetchCompanyFacts(cik: number): Promise<Record<string, { units: Record<string, SecFact[]> }> | null> {
  const padded = String(cik).padStart(10, "0");
  const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`, { headers: UA });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`companyfacts CIK${padded} -> HTTP ${res.status}`);
  const body = (await res.json()) as { facts?: { "us-gaap"?: Record<string, { units: Record<string, SecFact[]> }> } };
  return body.facts?.["us-gaap"] ?? null;
}

export function extractMappedFacts(gaap: Record<string, { units: Record<string, SecFact[]> }>): RawFact[] {
  const out: RawFact[] = [];
  for (const concept of ALL_CONCEPTS) {
    const units = gaap[concept]?.units;
    if (!units) continue;
    for (const [unit, facts] of Object.entries(units)) {
      for (const f of facts) {
        out.push({
          concept,
          unit,
          value: f.val,
          period_start: f.start ?? null,
          period_end: f.end,
          filed_date: f.filed,
          form: f.form,
          fiscal_year: f.fy ?? 0,
          fiscal_period: f.fp ?? "",
          frame: f.frame ?? "",
          accession: f.accn,
          is_amendment: f.form.endsWith("/A"),
        });
      }
    }
  }
  return out;
}
