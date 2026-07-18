import { createClient } from "@clickhouse/client";
import type { SecurityRecord, SymbolInterval } from "./types.js";

export function chClient() {
  return createClient({
    url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
    username: process.env.CLICKHOUSE_USER ?? "ticker",
    password: process.env.CLICKHOUSE_PASSWORD ?? "ticker",
    database: process.env.CLICKHOUSE_DB ?? "ticker_house",
  });
}

export type CH = ReturnType<typeof chClient>;

export async function ensureSecuritiesTable(ch: CH) {
  await ch.command({
    query: `
CREATE TABLE IF NOT EXISTS securities
(
    security_id UInt32,
    cik UInt32,
    ticker String,
    share_class LowCardinality(String) DEFAULT '',
    company_name String,
    exchange LowCardinality(String),
    symbol_history Array(Tuple(
        ticker String,
        exchange String,
        valid_from Date,
        valid_to Nullable(Date)
    )) DEFAULT [],
    country_code FixedString(2) DEFAULT 'US',
    trading_currency FixedString(3) DEFAULT 'USD',
    sic UInt16 DEFAULT 0,
    sic_description LowCardinality(String) DEFAULT '',
    sector LowCardinality(String) DEFAULT '',
    industry LowCardinality(String) DEFAULT '',
    website String DEFAULT '',
    description String DEFAULT '',
    ceo String DEFAULT '',
    headquarters String DEFAULT '',
    employee_count UInt32 DEFAULT 0,
    founded_year UInt16 DEFAULT 0,
    fiscal_year_end String DEFAULT '',
    is_active Bool DEFAULT true,
    source LowCardinality(String),
    source_updated_at DateTime64(3, 'UTC'),
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3),
    version UInt64
)
ENGINE = ReplacingMergeTree(version)
ORDER BY security_id`,
  });
}

// Named tuples travel as JSON objects in JSONEachRow.
function toInsertRow(r: SecurityRecord) {
  return {
    ...r,
    source_updated_at: r.source_updated_at.replace("T", " ").replace("Z", ""),
  };
}

export async function loadCurrentSecurities(ch: CH): Promise<SecurityRecord[]> {
  const rs = await ch.query({
    query: `SELECT security_id, cik, ticker, share_class, company_name, exchange,
                   symbol_history, country_code, trading_currency, sic, sic_description,
                   sector, industry, website, description, ceo, headquarters,
                   employee_count, founded_year, fiscal_year_end, is_active, source,
                   toString(source_updated_at) AS source_updated_at, version
            FROM securities FINAL`,
    format: "JSONEachRow",
  });
  const rows = await rs.json<Record<string, unknown>>();
  return rows.map((row) => ({
    ...(row as unknown as SecurityRecord),
    symbol_history: row.symbol_history as SymbolInterval[],
    version: Number(row.version),
  }));
}

export async function insertSecurities(ch: CH, records: SecurityRecord[]) {
  if (records.length === 0) return;
  await ch.insert({
    table: "securities",
    values: records.map(toInsertRow),
    format: "JSONEachRow",
  });
}

export async function runQualityChecks(ch: CH, universe: string[]): Promise<string[]> {
  const failures: string[] = [];

  const dup = await (
    await ch.query({
      query: `SELECT security_id FROM securities FINAL GROUP BY security_id HAVING count() > 1`,
      format: "JSONEachRow",
    })
  ).json<{ security_id: number }>();
  if (dup.length > 0) failures.push(`duplicate security_id values: ${dup.map((d) => d.security_id).join(", ")}`);

  const zeroCik = await (
    await ch.query({
      query: `SELECT count() AS c FROM securities FINAL WHERE is_active AND cik = 0`,
      format: "JSONEachRow",
    })
  ).json<{ c: string }>();
  if (Number(zeroCik[0].c) > 0) failures.push(`${zeroCik[0].c} active rows with cik = 0`);

  if (universe.length > 0) {
    const found = await (
      await ch.query({
        query: `SELECT ticker FROM securities FINAL WHERE is_active AND ticker IN ({tickers:Array(String)})`,
        query_params: { tickers: universe },
        format: "JSONEachRow",
      })
    ).json<{ ticker: string }>();
    const present = new Set(found.map((f) => f.ticker));
    const missing = universe.filter((t) => !present.has(t));
    if (missing.length > 0) failures.push(`universe tickers missing or inactive: ${missing.join(", ")}`);
  }

  return failures;
}
