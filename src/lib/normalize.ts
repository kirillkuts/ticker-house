import type { SecTickerRow, SecSubmissions } from "./sec.js";
import type { MassiveTickerDetails, MassiveTickerEvent } from "./massive.js";
import type { SecurityRecord, SymbolInterval } from "./types.js";
import { sicToSector, sicToIndustry } from "./sic.js";

const US_STATES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR".split(" "),
);

export function shareClassOf(ticker: string): string {
  const m = ticker.match(/-([A-Z])$/);
  return m ? m[1] : "";
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)\w/g, (c) => c.toUpperCase());
}

export function buildSymbolHistory(
  ticker: string,
  exchange: string,
  events: MassiveTickerEvent[],
): SymbolInterval[] {
  const changes = events
    .filter((e) => e.type === "ticker_change" && e.ticker_change?.ticker)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (changes.length === 0) {
    return [{ ticker, exchange, valid_from: "1970-01-01", valid_to: null }];
  }
  return changes.map((e, i) => ({
    ticker: e.ticker_change!.ticker,
    exchange,
    valid_from: e.date,
    valid_to: i + 1 < changes.length ? changes[i + 1].date : null,
  }));
}

export function normalizeSecurity(input: {
  base: SecTickerRow;
  submissions: SecSubmissions | null;
  details: MassiveTickerDetails | null;
  events: MassiveTickerEvent[];
  fetchedAt: string; // ISO
  version: number;
}): SecurityRecord {
  const { base, submissions, details, events, fetchedAt, version } = input;

  const state = submissions?.addresses?.business?.stateOrCountry ?? "";
  const city = submissions?.addresses?.business?.city ?? "";
  const countryCode = state && !US_STATES.has(state.toUpperCase()) ? state.toUpperCase().slice(0, 2) : "US";
  const sic = submissions ? parseInt(submissions.sic, 10) || 0 : 0;
  const sicDescription = submissions?.sicDescription ?? "";
  const enriched = details !== null;

  return {
    security_id: 0, // allocated in reconcile
    cik: base.cik,
    ticker: base.ticker,
    share_class: shareClassOf(base.ticker),
    company_name: base.name,
    exchange: base.exchange,
    symbol_history: buildSymbolHistory(base.ticker, base.exchange, events),
    country_code: countryCode,
    trading_currency: (details?.currency_name ?? "usd").toUpperCase().slice(0, 3),
    sic,
    sic_description: sicDescription,
    sector: sicToSector(sic),
    industry: sicToIndustry(sicDescription),
    website: details?.homepage_url ?? submissions?.website ?? "",
    description: details?.description ?? "",
    ceo: "",
    headquarters: city ? `${titleCase(city)}, ${state.toUpperCase()}` : "",
    employee_count: details?.total_employees ?? 0,
    founded_year: 0,
    fiscal_year_end: submissions?.fiscalYearEnd ?? "",
    is_active: true,
    source: enriched ? "sec+massive" : "sec",
    source_updated_at: fetchedAt,
    version,
  };
}
