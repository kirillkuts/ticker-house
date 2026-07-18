import { FIELD_DEFS, MAPPING_VERSION } from "./concepts.js";
import type { RawFact } from "./facts.js";

export interface FinancialPeriod {
  security_id: number;
  period_type: "quarter" | "annual";
  period_start: string;
  period_end: string;
  filing_date: string;
  fiscal_year: number;
  fiscal_period: string;
  form: string;
  currency: string;
  fields: Record<string, number | null>;
  source_accession: string;
  source_concepts: Record<string, string>;
  mapping_version: string;
  is_amendment: boolean;
  version: number;
}

// Averages and per-share values are not additive across quarters; never derive them by arithmetic.
const NON_ADDITIVE = new Set(["basic_eps", "diluted_eps", "basic_weighted_shares", "diluted_weighted_shares"]);

function days(start: string, end: string): number {
  return (Date.parse(end) - Date.parse(start)) / 86_400_000;
}

type Kind = "quarter" | "annual" | "ytd";

function classify(f: RawFact): Kind | null {
  if (!f.period_start) return null;
  const d = days(f.period_start, f.period_end);
  if (d >= 80 && d <= 100) return "quarter";
  if (d >= 350 && d <= 380) return "annual";
  if (d >= 150 && d <= 300) return "ytd";
  return null;
}

/** Latest filing wins for a (concept-priority) slot. */
function pick(facts: RawFact[]): RawFact | undefined {
  return facts.sort((a, b) => b.filed_date.localeCompare(a.filed_date))[0];
}

export function assemblePeriods(security_id: number, facts: RawFact[], version: number): FinancialPeriod[] {
  // Index duration facts: field -> kind -> period_end -> best fact.
  // Index instant facts:  field -> end -> best fact.
  const duration = new Map<string, Map<Kind, Map<string, RawFact[]>>>();
  const instant = new Map<string, Map<string, RawFact[]>>();
  const defByField = new Map(FIELD_DEFS.map((d) => [d.field, d]));

  for (const def of FIELD_DEFS) {
    for (const concept of def.concepts) {
      const matches = facts.filter((f) => f.concept === concept && f.unit === def.unit.replace("USD/shares", "USD/shares"));
      if (matches.length === 0) continue;
      if (def.kind === "instant") {
        const m = instant.get(def.field) ?? new Map<string, RawFact[]>();
        for (const f of matches.filter((x) => !x.period_start)) {
          m.set(f.period_end, [...(m.get(f.period_end) ?? []), f]);
        }
        instant.set(def.field, m);
      } else {
        const kinds = duration.get(def.field) ?? new Map<Kind, Map<string, RawFact[]>>();
        for (const f of matches) {
          const kind = classify(f);
          if (!kind) continue;
          const m = kinds.get(kind) ?? new Map<string, RawFact[]>();
          m.set(f.period_end, [...(m.get(f.period_end) ?? []), f]);
          kinds.set(kind, m);
        }
        duration.set(def.field, kinds);
      }
      break; // priority: first concept with any data wins for this field
    }
  }

  // Period skeletons come from net_income/revenue duration facts (every filer has one).
  const skeletonField = duration.has("net_income") ? "net_income" : "revenue";
  const skeletons = duration.get(skeletonField);
  if (!skeletons) return [];

  const periods: FinancialPeriod[] = [];
  const seen = new Set<string>();

  for (const type of ["quarter", "annual"] as const) {
    for (const [end, factList] of skeletons.get(type) ?? []) {
      const anchor = pick(factList)!;
      const key = `${type}:${end}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const fields: Record<string, number | null> = {};
      const sourceConcepts: Record<string, string> = {};
      let filingDate = anchor.filed_date;

      for (const def of FIELD_DEFS) {
        let fact: RawFact | undefined;
        let derived: string | null = null;

        if (def.kind === "instant") {
          fact = pick(instant.get(def.field)?.get(end) ?? []);
        } else {
          fact = pick(duration.get(def.field)?.get(type)?.get(end) ?? []);
          if (!fact && type === "quarter" && !NON_ADDITIVE.has(def.field)) {
            // Cash-flow style YTD differencing: YTD(end) - YTD(previous quarter end).
            const ytds = duration.get(def.field)?.get("ytd");
            const ytdNow = pick(ytds?.get(end) ?? []) ?? pick(duration.get(def.field)?.get("annual")?.get(end) ?? []);
            if (ytdNow && ytdNow.period_start) {
              const prev = [...(ytds?.values() ?? []), ...(duration.get(def.field)?.get("quarter")?.values() ?? [])]
                .map((l) => pick(l))
                .filter((f): f is RawFact => !!f && !!f.period_start)
                .filter((f) => f.period_start! >= ytdNow.period_start! && f.period_end < end)
                .sort((a, b) => b.period_end.localeCompare(a.period_end))[0];
              if (prev && prev.period_start === ytdNow.period_start) {
                fields[def.field] = ytdNow.value - prev.value;
                derived = `derived:ytd_diff(${ytdNow.concept})`;
              } else if (ytdNow && days(ytdNow.period_start, ytdNow.period_end) <= 100) {
                fields[def.field] = ytdNow.value;
                derived = `derived:q1_ytd(${ytdNow.concept})`;
              }
            }
          }
        }

        if (fact) {
          fields[def.field] = fact.value;
          sourceConcepts[def.field] = fact.concept;
          if (fact.filed_date < filingDate) filingDate = fact.filed_date;
        } else if (derived) {
          sourceConcepts[def.field] = derived;
        } else if (!(def.field in fields)) {
          fields[def.field] = null;
        }
      }

      // Computed fields
      if (fields.gross_profit === null && fields.revenue !== null && fields.cost_of_revenue !== null) {
        fields.gross_profit = fields.revenue! - fields.cost_of_revenue!;
        sourceConcepts.gross_profit = "derived:revenue-cost_of_revenue";
      }
      const std = fields.short_term_debt ?? 0;
      const ltd = fields.long_term_debt ?? 0;
      fields.total_debt = fields.short_term_debt === null && fields.long_term_debt === null ? null : std + ltd;
      fields.free_cash_flow =
        fields.operating_cash_flow !== null && fields.capital_expenditure !== null
          ? fields.operating_cash_flow! - fields.capital_expenditure!
          : null;
      if (fields.long_term_liabilities === null && fields.total_liabilities !== null && fields.current_liabilities !== null) {
        fields.long_term_liabilities = fields.total_liabilities! - fields.current_liabilities!;
        sourceConcepts.long_term_liabilities = "derived:total-current";
      }

      periods.push({
        security_id,
        period_type: type,
        period_start: anchor.period_start!,
        period_end: end,
        filing_date: anchor.filed_date,
        fiscal_year: anchor.fiscal_year,
        fiscal_period: anchor.fiscal_period,
        form: anchor.form,
        currency: "USD",
        fields,
        source_accession: anchor.accession,
        source_concepts: sourceConcepts,
        mapping_version: MAPPING_VERSION,
        is_amendment: anchor.is_amendment,
        version,
      });
    }
  }

  deriveQ4(periods, version);
  return periods;
}

const DURATION_FIELDS = FIELD_DEFS.filter((d) => d.kind === "duration" && !NON_ADDITIVE.has(d.field)).map((d) => d.field);

/** Q4 = FY − (Q1+Q2+Q3) for duration fields, when the annual row and exactly 3 in-year quarters exist. */
function deriveQ4(periods: FinancialPeriod[], version: number) {
  for (const annual of periods.filter((p) => p.period_type === "annual")) {
    const inYear = periods.filter(
      (p) => p.period_type === "quarter" && p.period_start >= annual.period_start && p.period_end <= annual.period_end,
    );
    if (inYear.length !== 3) continue;
    if (periods.some((p) => p.period_type === "quarter" && p.period_end === annual.period_end)) continue;

    const fields: Record<string, number | null> = {};
    const sourceConcepts: Record<string, string> = {};
    for (const f of DURATION_FIELDS) {
      const parts = [annual.fields[f], ...inYear.map((q) => q.fields[f])];
      if (parts.some((v) => v === null || v === undefined)) { fields[f] = null; continue; }
      fields[f] = (parts[0] as number) - (parts[1] as number) - (parts[2] as number) - (parts[3] as number);
      sourceConcepts[f] = "derived:fy_minus_quarters";
    }
    // Instants for Q4-end equal the annual row's instants.
    for (const d of FIELD_DEFS.filter((x) => x.kind === "instant")) {
      fields[d.field] = annual.fields[d.field];
      if (annual.source_concepts[d.field]) sourceConcepts[d.field] = annual.source_concepts[d.field];
    }
    fields.total_debt = annual.fields.total_debt;
    fields.free_cash_flow =
      fields.operating_cash_flow != null && fields.capital_expenditure != null
        ? fields.operating_cash_flow - fields.capital_expenditure
        : null;

    const lastQ = inYear.sort((a, b) => a.period_end.localeCompare(b.period_end))[2];
    periods.push({
      ...annual,
      period_type: "quarter",
      period_start: lastQ.period_end,
      fiscal_period: "Q4",
      fields,
      source_concepts: sourceConcepts,
      version,
    });
  }
}
