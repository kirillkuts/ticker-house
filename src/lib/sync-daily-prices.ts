import { saveRaw } from "./sec.js";
import { fetchGroupedDaily, fetchSplits, fetchDividends } from "./prices.js";
import { chClient, type CH } from "./clickhouse.js";
import type { SymbolInterval } from "./types.js";

export interface PriceRow {
  security_id: number;
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjusted_close: number | null;
  volume: number;
  transaction_count: number | null;
  vwap: number | null;
  split_factor: number;
  dividend_adjustment: number;
  source_symbol: string;
  source: string;
  version: number;
}

export interface PriceSyncReport {
  tradingDays: number;
  rowsInserted: number;
  unresolvedSymbols: number;
  splitsApplied: number;
  dividendsApplied: number;
  adjustedRecomputed: number;
  warnings: string[];
  failures: string[];
}

async function ensureDailyPricesTable(ch: CH) {
  await ch.command({
    query: `
CREATE TABLE IF NOT EXISTS daily_prices
(
    security_id UInt32,
    trade_date Date,
    open Decimal(18, 6),
    high Decimal(18, 6),
    low Decimal(18, 6),
    close Decimal(18, 6),
    adjusted_close Nullable(Decimal(18, 6)),
    volume UInt64,
    transaction_count Nullable(UInt32),
    vwap Nullable(Decimal(18, 6)),
    split_factor Decimal(18, 8) DEFAULT 1,
    dividend_adjustment Decimal(18, 8) DEFAULT 1,
    source_symbol String,
    source LowCardinality(String),
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3),
    version UInt64
)
ENGINE = ReplacingMergeTree(version)
ORDER BY (security_id, trade_date)`,
  });
}

interface ResolverEntry {
  security_id: number;
  ticker: string;
  history: SymbolInterval[];
}

/** ticker (dash notation) -> candidate securities; interval-checked at lookup. */
async function buildResolver(ch: CH): Promise<Map<string, ResolverEntry[]>> {
  const rs = await ch.query({
    query: `SELECT security_id, ticker, symbol_history AS history
            FROM securities FINAL WHERE is_active`,
    format: "JSONEachRow",
  });
  const map = new Map<string, ResolverEntry[]>();
  const add = (t: string, e: ResolverEntry) => map.set(t, [...(map.get(t) ?? []), e]);
  for (const row of await rs.json<ResolverEntry>()) {
    add(row.ticker, row);
    for (const s of row.history) if (s.ticker !== row.ticker) add(s.ticker, row);
  }
  return map;
}

function resolve(map: Map<string, ResolverEntry[]>, massiveTicker: string, date: string): number | null {
  const ticker = massiveTicker.replace(/\.([A-Z])$/, "-$1");
  const candidates = map.get(ticker);
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].security_id;
  // Multiple securities share this symbol at different times: pick by interval.
  for (const c of candidates) {
    for (const s of c.history) {
      if (s.ticker === ticker && s.valid_from <= date && (s.valid_to === null || date < s.valid_to)) {
        return c.security_id;
      }
    }
  }
  return candidates[0].security_id;
}

function* dateRange(from: string, to: string): Generator<string> {
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

async function recomputeAdjustedClose(ch: CH, securityIds: number[], version: number): Promise<number> {
  if (securityIds.length === 0) return 0;
  await ch.command({
    query: `
INSERT INTO daily_prices
SELECT security_id, trade_date, open, high, low, close,
       toDecimal64(close / exp(sum(log(toFloat64(split_factor))) OVER (
           PARTITION BY security_id ORDER BY trade_date DESC
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)), 6) AS adjusted_close,
       volume, transaction_count, vwap, split_factor, dividend_adjustment,
       source_symbol, source, now64(3), {version:UInt64}
FROM daily_prices FINAL
WHERE security_id IN ({ids:Array(UInt32)})`,
    query_params: { ids: securityIds, version },
  });
  const rs = await ch.query({
    query: `SELECT count() AS c FROM daily_prices FINAL WHERE security_id IN ({ids:Array(UInt32)})`,
    query_params: { ids: securityIds },
    format: "JSONEachRow",
  });
  return Number((await rs.json<{ c: string }>())[0].c);
}

export async function syncDailyPrices(
  from: string,
  to: string,
  log: (msg: string) => void = console.log,
): Promise<PriceSyncReport> {
  const version = Date.now();
  const runDate = new Date().toISOString().slice(0, 10);
  const warnings: string[] = [];
  const ch = chClient();

  try {
    await ensureDailyPricesTable(ch);
    const resolver = await buildResolver(ch);
    if (resolver.size === 0) throw new Error("securities table is empty; run sync:securities first");

    const rows: PriceRow[] = [];
    const byKey = new Map<string, PriceRow>(); // `${security_id}:${date}` for event stamping
    let tradingDays = 0;
    let unresolved = 0;

    for (const date of dateRange(from, to)) {
      const day = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (day === 0 || day === 6) continue;
      const results = await fetchGroupedDaily(date);
      if (results.length === 0) {
        warnings.push(`${date}: weekday with no grouped-daily data (holiday or not yet published)`);
        continue;
      }
      tradingDays++;
      await saveRaw(runDate, `prices_${date}.json`, results);
      for (const r of results) {
        const sid = resolve(resolver, r.T, date);
        if (sid === null) { unresolved++; continue; }
        const row: PriceRow = {
          security_id: sid,
          trade_date: date,
          open: r.o, high: r.h, low: r.l, close: r.c,
          adjusted_close: null,
          volume: Math.round(r.v),
          transaction_count: r.n ?? null,
          vwap: r.vw ?? null,
          split_factor: 1,
          dividend_adjustment: 1,
          source_symbol: r.T,
          source: "massive",
          version,
        };
        rows.push(row);
        byKey.set(`${sid}:${date}`, row);
      }
      log(`${date}: ${results.length} rows, ${rows.length} resolved total`);
    }

    log("fetching splits and dividends for range");
    const splits = await fetchSplits(from, to);
    const dividends = await fetchDividends(from, to);
    await saveRaw(runDate, "splits.json", splits);
    await saveRaw(runDate, "dividends.json", dividends);

    let splitsApplied = 0;
    const splitSecurityIds = new Set<number>();
    for (const s of splits) {
      const sid = resolve(resolver, s.ticker, s.execution_date);
      if (sid === null) continue;
      splitSecurityIds.add(sid);
      const row = byKey.get(`${sid}:${s.execution_date}`);
      if (row) { row.split_factor = s.split_to / s.split_from; splitsApplied++; }
      else warnings.push(`split for ${s.ticker} on ${s.execution_date}: no price row in range`);
    }
    let dividendsApplied = 0;
    for (const d of dividends) {
      const sid = resolve(resolver, d.ticker, d.ex_dividend_date);
      if (sid === null) continue;
      const row = byKey.get(`${sid}:${d.ex_dividend_date}`);
      if (row && d.historical_adjustment_factor) {
        row.dividend_adjustment = d.historical_adjustment_factor;
        dividendsApplied++;
      }
    }

    // adjusted_close = close for split-free securities; recompute pass fixes the rest.
    for (const row of rows) if (!splitSecurityIds.has(row.security_id)) row.adjusted_close = row.close;

    log(`inserting ${rows.length} price rows`);
    for (let i = 0; i < rows.length; i += 100_000) {
      await ch.insert({ table: "daily_prices", values: rows.slice(i, i + 100_000), format: "JSONEachRow" });
    }

    const adjustedRecomputed = await recomputeAdjustedClose(ch, [...splitSecurityIds], version + 1);

    const failures = await priceQualityChecks(ch, from, to);
    const report: PriceSyncReport = {
      tradingDays,
      rowsInserted: rows.length,
      unresolvedSymbols: unresolved,
      splitsApplied,
      dividendsApplied,
      adjustedRecomputed,
      warnings,
      failures,
    };
    log(JSON.stringify(report, null, 2));
    if (failures.length > 0) throw new Error(`quality checks failed: ${failures.join("; ")}`);
    return report;
  } finally {
    await ch.close();
  }
}

async function priceQualityChecks(ch: CH, from: string, to: string): Promise<string[]> {
  const failures: string[] = [];

  const dup = await (
    await ch.query({
      query: `SELECT count() AS c FROM (
                SELECT security_id, trade_date FROM daily_prices FINAL
                WHERE trade_date BETWEEN {from:Date} AND {to:Date}
                GROUP BY security_id, trade_date HAVING count() > 1)`,
      query_params: { from, to },
      format: "JSONEachRow",
    })
  ).json<{ c: string }>();
  if (Number(dup[0].c) > 0) failures.push(`${dup[0].c} duplicate (security_id, trade_date) pairs`);

  const ohlc = await (
    await ch.query({
      query: `SELECT count() AS c FROM daily_prices FINAL
              WHERE trade_date BETWEEN {from:Date} AND {to:Date}
                AND (high < low OR close > high OR close < low OR open > high OR open < low)`,
      query_params: { from, to },
      format: "JSONEachRow",
    })
  ).json<{ c: string }>();
  if (Number(ohlc[0].c) > 0) failures.push(`${ohlc[0].c} rows with inconsistent OHLC`);

  const thin = await (
    await ch.query({
      query: `SELECT toString(trade_date) AS d, count() AS c FROM daily_prices FINAL
              WHERE trade_date BETWEEN {from:Date} AND {to:Date}
              GROUP BY trade_date HAVING count() < 5000`,
      query_params: { from, to },
      format: "JSONEachRow",
    })
  ).json<{ d: string; c: string }>();
  for (const t of thin) failures.push(`${t.d}: only ${t.c} rows ingested`);

  return failures;
}
