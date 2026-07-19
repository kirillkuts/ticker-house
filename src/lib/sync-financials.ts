import { readFile } from "node:fs/promises";
import { saveRaw } from "./sec.js";
import { fetchCompanyFacts, extractMappedFacts, type RawFact } from "./facts.js";
import { assemblePeriods, type FinancialPeriod } from "./normalize-financials.js";
import { chClient, type CH } from "./clickhouse.js";
import { FIELD_DEFS } from "./concepts.js";

export interface FinancialsReport {
  tickers: number;
  factsInserted: number;
  periodsInserted: number;
  warnings: string[];
  failures: string[];
}

const FIELD_COLUMNS = FIELD_DEFS.map((d) => d.field).concat(["total_debt", "free_cash_flow"]);

async function ensureTables(ch: CH) {
  await ch.command({
    query: `
CREATE TABLE IF NOT EXISTS financial_facts
(
    security_id UInt32,
    taxonomy LowCardinality(String),
    concept LowCardinality(String),
    unit LowCardinality(String),
    value Decimal(38, 8),
    period_start Nullable(Date),
    period_end Date,
    filed_date Date,
    form LowCardinality(String),
    fiscal_year UInt16 DEFAULT 0,
    fiscal_period LowCardinality(String) DEFAULT '',
    frame LowCardinality(String) DEFAULT '',
    accession String,
    is_amendment Bool DEFAULT false,
    source LowCardinality(String) DEFAULT 'sec',
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3),
    version UInt64
)
ENGINE = ReplacingMergeTree(version)
ORDER BY (security_id, concept, period_end, accession, unit)`,
  });

  const fieldCols = FIELD_COLUMNS.map((f) =>
    ["basic_eps", "diluted_eps"].includes(f)
      ? `${f} Nullable(Decimal(18, 6))`
      : ["basic_weighted_shares", "diluted_weighted_shares"].includes(f)
        ? `${f} Nullable(UInt64)`
        : `${f} Nullable(Decimal(24, 2))`,
  ).join(",\n    ");

  await ch.command({
    query: `
CREATE TABLE IF NOT EXISTS financial_periods
(
    security_id UInt32,
    period_type LowCardinality(String),
    period_start Date,
    period_end Date,
    filing_date Date,
    fiscal_year UInt16,
    fiscal_period LowCardinality(String),
    form LowCardinality(String),
    currency FixedString(3),
    ${fieldCols},
    source LowCardinality(String) DEFAULT 'sec',
    source_accession String,
    source_concepts Map(String, String) DEFAULT map(),
    mapping_version LowCardinality(String),
    is_amendment Bool DEFAULT false,
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3),
    version UInt64
)
ENGINE = ReplacingMergeTree(version)
ORDER BY (security_id, period_type, period_end)`,
  });

  // CREATE IF NOT EXISTS doesn't extend an existing table; add any columns
  // introduced by newer FIELD_DEFS versions.
  for (const f of FIELD_COLUMNS) {
    const type = ["basic_eps", "diluted_eps"].includes(f)
      ? "Nullable(Decimal(18, 6))"
      : ["basic_weighted_shares", "diluted_weighted_shares"].includes(f)
        ? "Nullable(UInt64)"
        : "Nullable(Decimal(24, 2))";
    await ch.command({ query: `ALTER TABLE financial_periods ADD COLUMN IF NOT EXISTS ${f} ${type} AFTER currency` });
  }
}

function periodToRow(p: FinancialPeriod) {
  return {
    security_id: p.security_id,
    period_type: p.period_type,
    period_start: p.period_start,
    period_end: p.period_end,
    filing_date: p.filing_date,
    fiscal_year: p.fiscal_year,
    fiscal_period: p.fiscal_period,
    form: p.form,
    currency: p.currency,
    ...Object.fromEntries(FIELD_COLUMNS.map((f) => {
      const v = p.fields[f] ?? null;
      // Weighted-share columns are UInt64: round; EPS keep as-is.
      if (v !== null && ["basic_weighted_shares", "diluted_weighted_shares"].includes(f)) return [f, Math.round(v)];
      return [f, v];
    })),
    source: "sec",
    source_accession: p.source_accession,
    source_concepts: p.source_concepts,
    mapping_version: p.mapping_version,
    is_amendment: p.is_amendment,
    version: p.version,
  };
}

export async function syncFinancials(log: (msg: string) => void = console.log): Promise<FinancialsReport> {
  const version = Date.now();
  const runDate = new Date().toISOString().slice(0, 10);
  const warnings: string[] = [];
  const ch = chClient();

  try {
    await ensureTables(ch);

    const universe = (await readFile("data/universe.txt", "utf8"))
      .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

    const secRows = await (
      await ch.query({
        query: `SELECT security_id, cik, ticker FROM securities FINAL
                WHERE is_active AND ticker IN ({tickers:Array(String)})`,
        query_params: { tickers: universe },
        format: "JSONEachRow",
      })
    ).json<{ security_id: number; cik: number; ticker: string }>();

    let factsInserted = 0;
    let periodsInserted = 0;

    for (const sec of secRows) {
      log(`fetching companyfacts for ${sec.ticker} (CIK ${sec.cik})`);
      const gaap = await fetchCompanyFacts(sec.cik);
      if (!gaap) { warnings.push(`${sec.ticker}: no companyfacts (CIK ${sec.cik})`); continue; }
      await saveRaw(runDate, `facts_${sec.ticker}.json`, gaap);

      const facts: RawFact[] = extractMappedFacts(gaap);
      if (facts.length === 0) { warnings.push(`${sec.ticker}: no mapped us-gaap facts (IFRS filer?)`); continue; }

      const periods = assemblePeriods(sec.security_id, facts, version);

      await ch.insert({
        table: "financial_facts",
        values: facts.map((f) => ({ security_id: sec.security_id, taxonomy: "us-gaap", source: "sec", version, ...f })),
        format: "JSONEachRow",
      });
      await ch.insert({ table: "financial_periods", values: periods.map(periodToRow), format: "JSONEachRow" });
      factsInserted += facts.length;
      periodsInserted += periods.length;
      log(`${sec.ticker}: ${facts.length} facts, ${periods.length} periods`);
      await new Promise((r) => setTimeout(r, 120)); // stay under SEC 10 req/s
    }

    const failures = await qualityChecks(ch, secRows.map((s) => s.security_id), warnings);
    const report: FinancialsReport = { tickers: secRows.length, factsInserted, periodsInserted, warnings, failures };
    log(JSON.stringify({ ...report, warnings: warnings.length, failures }, null, 2));
    if (failures.length > 0) throw new Error(`quality checks failed: ${failures.join("; ")}`);
    return report;
  } finally {
    await ch.close();
  }
}

async function qualityChecks(ch: CH, ids: number[], warnings: string[]): Promise<string[]> {
  const failures: string[] = [];

  const dup = await (
    await ch.query({
      query: `SELECT count() AS c FROM (
                SELECT security_id, period_type, period_end FROM financial_periods FINAL
                GROUP BY security_id, period_type, period_end HAVING count() > 1)`,
      format: "JSONEachRow",
    })
  ).json<{ c: string }>();
  if (Number(dup[0].c) > 0) failures.push(`${dup[0].c} duplicate (security_id, period_type, period_end)`);

  const identity = await (
    await ch.query({
      query: `SELECT count() AS c FROM financial_periods FINAL
              WHERE total_assets IS NOT NULL AND total_liabilities IS NOT NULL AND shareholders_equity IS NOT NULL
                AND abs(toFloat64(total_assets) - (toFloat64(total_liabilities) + toFloat64(shareholders_equity)))
                    > 0.01 * toFloat64(total_assets)`,
      format: "JSONEachRow",
    })
  ).json<{ c: string }>();
  // Warning, not failure: shareholders_equity is parent-only, so companies with
  // noncontrolling interests (TSLA, BRK) legitimately show assets > liabilities + equity.
  if (Number(identity[0].c) > 0) warnings.push(`${identity[0].c} rows where assets != liabilities + parent equity (noncontrolling interests)`);

  const withAnnual = await (
    await ch.query({
      query: `SELECT DISTINCT security_id FROM financial_periods FINAL WHERE period_type = 'annual'`,
      format: "JSONEachRow",
    })
  ).json<{ security_id: number }>();
  const annualSet = new Set(withAnnual.map((r) => r.security_id));
  for (const id of ids) if (!annualSet.has(id)) failures.push(`security_id ${id} has no annual period`);

  const qsum = await (
    await ch.query({
      query: `
        SELECT a.security_id AS sid, toString(a.period_end) AS pe
        FROM financial_periods AS a FINAL
        JOIN (SELECT security_id, period_end AS qe, revenue,
                     period_start FROM financial_periods FINAL WHERE period_type = 'quarter' AND revenue IS NOT NULL) AS q
          ON q.security_id = a.security_id AND q.period_start >= a.period_start AND q.qe <= a.period_end
        WHERE a.period_type = 'annual' AND a.revenue IS NOT NULL
        GROUP BY a.security_id, a.period_end, a.revenue
        HAVING count() = 4 AND abs(toFloat64(a.revenue) - sum(toFloat64(q.revenue))) > 0.02 * toFloat64(a.revenue)`,
      format: "JSONEachRow",
    })
  ).json<{ sid: number; pe: string }>().catch(() => []);
  for (const r of qsum) warnings.push(`annual revenue != sum of quarters: security_id ${r.sid}, FY end ${r.pe}`);

  return failures;
}
