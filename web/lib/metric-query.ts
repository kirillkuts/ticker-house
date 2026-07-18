import { queryRows } from "./clickhouse";
import { METRICS, type MetricKey, type Unit } from "./metric-registry";

export const OPS = { gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "=" } as const;
export type Op = keyof typeof OPS;

export type Period = "latest" | "annual_5y" | "quarterly_8";
export type Display = "auto" | "table" | "line" | "bar" | "kpi";

export interface MetricFilter {
  field: MetricKey;
  op: Op;
  value: number;
}

export interface MetricQuerySpec {
  metrics: MetricKey[];
  tickers?: string[];
  filters?: MetricFilter[];
  sort?: { field: MetricKey; dir: "asc" | "desc" };
  limit?: number;
  period: Period;
  display?: Display;
}

export interface MetricColumn {
  key: string;
  label: string;
  unit: Unit;
}

export interface MetricQueryResult {
  spec: MetricQuerySpec;
  columns: MetricColumn[];
  rows: Record<string, string | number | null>[];
}

const MAX_LIMIT = 50;
const MAX_TS_TICKERS = 8;

// The on-the-fly source for "latest" metrics. When a precomputed
// metrics_latest table exists, swap this function for a plain FROM clause.
// Every expression here is a static string; model input never reaches it.
function latestInnerSql(selectCols: string, withTickers: boolean): string {
  return `
WITH
q AS (
  SELECT * FROM financial_periods FINAL
  WHERE period_type = 'quarter'
  ORDER BY period_end DESC
  LIMIT 4 BY security_id
),
ttm AS (
  SELECT
    security_id,
    if(count() = 4, sum(toFloat64OrNull(toString(revenue))), NULL)           AS revenue_ttm,
    if(count() = 4, sum(toFloat64OrNull(toString(gross_profit))), NULL)      AS gross_profit_ttm,
    if(count() = 4, sum(toFloat64OrNull(toString(operating_income))), NULL)  AS operating_income_ttm,
    if(count() = 4, sum(toFloat64OrNull(toString(net_income))), NULL)        AS net_income_ttm,
    if(count() = 4, sum(toFloat64OrNull(toString(free_cash_flow))), NULL)    AS fcf_ttm,
    if(count() = 4, sum(toFloat64OrNull(toString(operating_cash_flow))), NULL) AS ocf_ttm,
    argMaxIf(toFloat64OrNull(toString(total_assets)), period_end, total_assets IS NOT NULL)           AS total_assets_i,
    argMaxIf(toFloat64OrNull(toString(total_liabilities)), period_end, total_liabilities IS NOT NULL) AS total_liabilities_i,
    argMaxIf(toFloat64OrNull(toString(shareholders_equity)), period_end, shareholders_equity IS NOT NULL) AS equity_i,
    argMaxIf(toFloat64OrNull(toString(cash_and_equivalents)), period_end, cash_and_equivalents IS NOT NULL) AS cash_i,
    argMaxIf(toFloat64OrNull(toString(total_debt)), period_end, total_debt IS NOT NULL)               AS total_debt_i,
    argMaxIf(toFloat64OrNull(toString(current_assets)), period_end, current_assets IS NOT NULL)       AS cur_assets_i,
    argMaxIf(toFloat64OrNull(toString(current_liabilities)), period_end, current_liabilities IS NOT NULL) AS cur_liab_i,
    argMaxIf(toFloat64(diluted_weighted_shares), period_end, diluted_weighted_shares IS NOT NULL)     AS shares_i
  FROM q
  GROUP BY security_id
),
a AS (
  SELECT * FROM financial_periods FINAL
  WHERE period_type = 'annual'
  ORDER BY period_end DESC
  LIMIT 2 BY security_id
),
yoy AS (
  SELECT
    security_id,
    if(count() = 2, argMax(toFloat64OrNull(toString(revenue)), period_end), NULL)     AS rev_latest,
    if(count() = 2, argMin(toFloat64OrNull(toString(revenue)), period_end), NULL)     AS rev_prior,
    if(count() = 2, argMax(toFloat64OrNull(toString(diluted_eps)), period_end), NULL) AS eps_latest,
    if(count() = 2, argMin(toFloat64OrNull(toString(diluted_eps)), period_end), NULL) AS eps_prior
  FROM a
  GROUP BY security_id
),
px AS (
  -- Group by source_symbol too: symbol_history can map a reused old ticker
  -- (e.g. FB) onto the same security_id; join below picks the current symbol.
  SELECT security_id,
         replaceAll(source_symbol, '.', '-') AS px_symbol,
         argMax(toFloat64(close), trade_date) AS last_close
  FROM daily_prices FINAL
  WHERE trade_date >= (SELECT max(trade_date) FROM daily_prices) - 7
  GROUP BY security_id, px_symbol
)
SELECT s.ticker AS ticker, s.company_name AS company_name, ${selectCols}
FROM ttm
INNER JOIN securities AS s FINAL ON s.security_id = ttm.security_id AND s.is_active
LEFT JOIN yoy ON yoy.security_id = ttm.security_id
LEFT JOIN px ON px.security_id = ttm.security_id AND px.px_symbol = upper(s.ticker)
${withTickers ? "WHERE upper(s.ticker) IN {tickers:Array(String)}" : ""}`;
}

function buildLatest(spec: MetricQuerySpec) {
  // Compute the union of everything referenced so filters/sort can apply.
  const keys = [...new Set([
    ...spec.metrics,
    ...(spec.filters ?? []).map((f) => f.field),
    ...(spec.sort ? [spec.sort.field] : []),
  ])];
  const selectCols = keys.map((k) => `${METRICS[k].latestExpr} AS ${k}`).join(",\n  ");

  const params: Record<string, unknown> = {};
  const where: string[] = [];
  (spec.filters ?? []).forEach((flt, i) => {
    const p = `f${i}`;
    params[p] = flt.value;
    where.push(`${flt.field} ${OPS[flt.op]} {${p}:Float64}`);
  });

  if (spec.tickers?.length) params.tickers = spec.tickers.map((t) => t.toUpperCase());
  params.lim = Math.min(Math.max(spec.limit ?? 20, 1), MAX_LIMIT);

  const sort = spec.sort
    ? `ORDER BY ${spec.sort.field} ${spec.sort.dir === "asc" ? "ASC" : "DESC"} NULLS LAST`
    : "ORDER BY ticker ASC";

  const sql = `
SELECT * FROM (${latestInnerSql(selectCols, Boolean(spec.tickers?.length))})
${where.length ? `WHERE ${where.join(" AND ")}` : ""}
${sort}
LIMIT {lim:UInt32}
SETTINGS join_use_nulls = 1`;

  return { sql, params, keys };
}

function buildTimeseries(spec: MetricQuerySpec) {
  const keys = [...new Set(spec.metrics)];
  const selectCols = keys.map((k) => `${METRICS[k].periodExpr} AS ${k}`).join(",\n  ");
  const periodType = spec.period === "annual_5y" ? "annual" : "quarter";
  const perTicker = spec.period === "annual_5y" ? 5 : 8;

  const sql = `
SELECT * FROM (
  SELECT
    s.ticker AS ticker,
    toString(p.period_end) AS period_end,
    concat(p.fiscal_period, ' ', toString(p.fiscal_year)) AS fiscal_label,
    ${selectCols}
  FROM financial_periods AS p FINAL
  INNER JOIN (
    SELECT security_id, ticker FROM securities FINAL
    WHERE is_active AND upper(ticker) IN {tickers:Array(String)}
  ) AS s ON s.security_id = p.security_id
  WHERE p.period_type = {pt:String}
  ORDER BY p.period_end DESC
  LIMIT {n:UInt32} BY p.security_id
)
ORDER BY ticker ASC, period_end ASC
SETTINGS join_use_nulls = 1`;

  const params = {
    tickers: (spec.tickers ?? []).map((t) => t.toUpperCase()),
    pt: periodType,
    n: perTicker,
  };
  return { sql, params, keys };
}

export async function runMetricQuery(
  spec: MetricQuerySpec,
): Promise<MetricQueryResult | { error: string }> {
  const badKeys = [
    ...spec.metrics,
    ...(spec.filters ?? []).map((f) => f.field),
    ...(spec.sort ? [spec.sort.field] : []),
  ].filter((k) => !(k in METRICS));
  if (badKeys.length) return { error: `Unknown metric keys: ${badKeys.join(", ")}` };
  if (spec.metrics.length === 0) return { error: "At least one metric is required" };

  let built;
  if (spec.period === "latest") {
    built = buildLatest(spec);
  } else {
    if (!spec.tickers?.length)
      return { error: "Time-series queries require an explicit tickers list (max 8)" };
    if (spec.tickers.length > MAX_TS_TICKERS)
      return { error: `Too many tickers for a time series (max ${MAX_TS_TICKERS})` };
    const noTs = spec.metrics.filter((k) => METRICS[k].periodExpr === null);
    if (noTs.length)
      return { error: `Not available as time series: ${noTs.join(", ")}. Use period "latest" for these.` };
    if (spec.filters?.length || spec.sort)
      return { error: "Filters and sort are only supported with period \"latest\"" };
    built = buildTimeseries(spec);
  }

  try {
    const rows = await queryRows<Record<string, string | number | null>>(built.sql, built.params);
    if (rows.length === 0)
      return { error: "No rows matched. Data covers a limited ticker universe; a filter may also have excluded rows with missing (NULL) metrics." };
    return {
      spec,
      columns: built.keys.map((k) => ({ key: k, label: METRICS[k].label, unit: METRICS[k].unit })),
      rows,
    };
  } catch (e) {
    return { error: `Query failed: ${e instanceof Error ? e.message.slice(0, 300) : String(e)}` };
  }
}
