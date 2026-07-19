// The metric whitelist. The query compiler resolves columns ONLY through this
// registry; the model can only reference these keys via a zod enum. SQL
// expressions here are static author-controlled strings — never model input.
//
// latestExpr operates over the aliases of the "latest" query's CTEs:
//   ttm  — last 4 quarters aggregated per security (sums + latest instants)
//   yoy  — latest vs prior annual period
//   px   — latest close from daily_prices
// periodExpr operates over one financial_periods row (unqualified columns);
// null means the metric is not available as a time series.

export type Unit = "usd_large" | "percent" | "ratio" | "per_share" | "shares";

export interface MetricDef {
  unit: Unit;
  label: string;
  // For the model's tool definition: precise, states TTM/latest semantics.
  description: string;
  // For the widget's hover tooltip: plain language, written for a non-expert.
  explain: string;
  latestExpr: string;
  periodExpr: string | null;
}

// Cast helper for Nullable(Decimal) columns (same pattern as views.ts).
const f = (col: string) => `toFloat64OrNull(toString(${col}))`;
const margin = (num: string, den: string) =>
  `if(${den} IS NOT NULL AND ${den} != 0, toFloat64(${num}) / toFloat64(${den}) * 100, NULL)`;

export const METRICS = {
  revenue: {
    unit: "usd_large", label: "Revenue",
    description: "Total revenue. Latest = trailing twelve months (TTM).",
    explain: "All the money the company brought in from sales, before any costs. “Latest” adds up the last four reported quarters.",
    latestExpr: "ttm.revenue_ttm", periodExpr: f("revenue"),
  },
  gross_profit: {
    unit: "usd_large", label: "Gross profit",
    description: "Gross profit. Latest = TTM.",
    explain: "Sales minus the direct cost of making the product (materials, manufacturing). What's left has to cover everything else.",
    latestExpr: "ttm.gross_profit_ttm", periodExpr: f("gross_profit"),
  },
  operating_income: {
    unit: "usd_large", label: "Operating income",
    description: "Operating income. Latest = TTM.",
    explain: "Profit from the core business after running costs like R&D, marketing and admin, but before interest and taxes.",
    latestExpr: "ttm.operating_income_ttm", periodExpr: f("operating_income"),
  },
  net_income: {
    unit: "usd_large", label: "Net income",
    description: "Net income. Latest = TTM.",
    explain: "The bottom line: profit left after every cost, including interest and taxes.",
    latestExpr: "ttm.net_income_ttm", periodExpr: f("net_income"),
  },
  eps: {
    unit: "per_share", label: "Diluted EPS",
    description:
      "Diluted earnings per share. Latest = TTM net income / latest diluted weighted shares (Q4-derived quarters lack per-share data, so summing quarterly EPS would undercount).",
    explain: "Profit divided by the number of shares: how many dollars of profit each share earned over the year.",
    latestExpr: "ttm.net_income_ttm / nullIf(ttm.shares_i, 0)", periodExpr: f("diluted_eps"),
  },
  free_cash_flow: {
    unit: "usd_large", label: "Free cash flow",
    description: "Operating cash flow minus capital expenditure. Latest = TTM.",
    explain: "Cash left after running the business and paying for equipment and buildings. Money the company can spend freely on dividends, buybacks or acquisitions.",
    latestExpr: "ttm.fcf_ttm", periodExpr: f("free_cash_flow"),
  },
  operating_cash_flow: {
    unit: "usd_large", label: "Operating cash flow",
    description: "Cash from operations. Latest = TTM.",
    explain: "Actual cash the day-to-day business generated, before spending on equipment or investments.",
    latestExpr: "ttm.ocf_ttm", periodExpr: f("operating_cash_flow"),
  },
  gross_margin: {
    unit: "percent", label: "Gross margin",
    description: "Gross profit / revenue, percent.",
    explain: "Share of each sales dollar left after direct production costs. 40% means $40 kept from every $100 of sales before running costs.",
    latestExpr: "ttm.gross_profit_ttm / nullIf(ttm.revenue_ttm, 0) * 100",
    periodExpr: margin("gross_profit", "revenue"),
  },
  operating_margin: {
    unit: "percent", label: "Operating margin",
    description: "Operating income / revenue, percent.",
    explain: "Share of each sales dollar left after the costs of running the business (R&D, marketing, admin), before interest and taxes.",
    latestExpr: "ttm.operating_income_ttm / nullIf(ttm.revenue_ttm, 0) * 100",
    periodExpr: margin("operating_income", "revenue"),
  },
  net_margin: {
    unit: "percent", label: "Net margin",
    description: "Net income / revenue, percent.",
    explain: "Share of each sales dollar kept as final profit. 27% means the company keeps $27 of every $100 in sales.",
    latestExpr: "ttm.net_income_ttm / nullIf(ttm.revenue_ttm, 0) * 100",
    periodExpr: margin("net_income", "revenue"),
  },
  total_assets: {
    unit: "usd_large", label: "Total assets",
    description: "Balance-sheet total assets (latest reported).",
    explain: "Everything the company owns: cash, factories, inventory, investments.",
    latestExpr: "ttm.total_assets_i", periodExpr: f("total_assets"),
  },
  total_liabilities: {
    unit: "usd_large", label: "Total liabilities",
    description: "Balance-sheet total liabilities (latest reported).",
    explain: "Everything the company owes: debt, unpaid bills, other obligations.",
    latestExpr: "ttm.total_liabilities_i", periodExpr: f("total_liabilities"),
  },
  shareholders_equity: {
    unit: "usd_large", label: "Shareholders' equity",
    description: "Balance-sheet shareholders' equity (latest reported).",
    explain: "What the company owns minus what it owes. The slice that belongs to shareholders.",
    latestExpr: "ttm.equity_i", periodExpr: f("shareholders_equity"),
  },
  cash_and_equivalents: {
    unit: "usd_large", label: "Cash & equivalents",
    description: "Cash and cash equivalents (latest reported).",
    explain: "Cash in the bank plus near-cash investments the company can tap immediately.",
    latestExpr: "ttm.cash_i", periodExpr: f("cash_and_equivalents"),
  },
  total_debt: {
    unit: "usd_large", label: "Total debt",
    description: "Short-term plus long-term debt (latest reported).",
    explain: "All borrowed money combined, both due soon and due years out.",
    latestExpr: "ttm.total_debt_i", periodExpr: f("total_debt"),
  },
  debt_to_equity: {
    unit: "ratio", label: "Debt / equity",
    description: "Total debt / shareholders' equity.",
    explain: "Borrowed money relative to shareholders' money. 1.0x means debt equals equity; higher means the company leans more on borrowing, which adds risk.",
    latestExpr: "ttm.total_debt_i / nullIf(ttm.equity_i, 0)",
    periodExpr: margin("total_debt", "shareholders_equity").replace(" * 100", ""),
  },
  current_ratio: {
    unit: "ratio", label: "Current ratio",
    description: "Current assets / current liabilities.",
    explain: "Short-term assets versus bills due within a year. Above 1x means it can cover what's coming due.",
    latestExpr: "ttm.cur_assets_i / nullIf(ttm.cur_liab_i, 0)",
    periodExpr: margin("current_assets", "current_liabilities").replace(" * 100", ""),
  },
  roe: {
    unit: "percent", label: "Return on equity",
    description: "TTM net income / latest shareholders' equity, percent. Latest only.",
    explain: "Yearly profit per dollar of shareholders' money. 15% means $0.15 of profit for every $1 of equity. Heavy buybacks or debt shrink the equity base and can inflate this number.",
    latestExpr: "ttm.net_income_ttm / nullIf(ttm.equity_i, 0) * 100",
    periodExpr: null,
  },
  roa: {
    unit: "percent", label: "Return on assets",
    description: "TTM net income / latest total assets, percent. Latest only.",
    explain: "Yearly profit per dollar of everything the company owns. Shows how hard the whole asset base works.",
    latestExpr: "ttm.net_income_ttm / nullIf(ttm.total_assets_i, 0) * 100",
    periodExpr: null,
  },
  revenue_growth_yoy: {
    unit: "percent", label: "Revenue growth YoY",
    description: "Latest annual revenue vs prior annual, percent. Latest only.",
    explain: "How much sales grew versus the year before, in percent.",
    latestExpr: "(yoy.rev_latest / nullIf(yoy.rev_prior, 0) - 1) * 100",
    periodExpr: null,
  },
  eps_growth_yoy: {
    unit: "percent", label: "EPS growth YoY",
    description: "Latest annual diluted EPS vs prior annual, percent. Latest only.",
    explain: "How much profit per share grew versus the year before, in percent.",
    latestExpr: "(yoy.eps_latest / nullIf(yoy.eps_prior, 0) - 1) * 100",
    periodExpr: null,
  },
  last_close: {
    unit: "per_share", label: "Last close",
    description: "Most recent closing price. Latest only.",
    explain: "The share price at the end of the most recent trading day.",
    latestExpr: "px.last_close", periodExpr: null,
  },
  market_cap: {
    unit: "usd_large", label: "Market cap",
    description: "Last close × latest diluted weighted shares (approximation). Latest only.",
    explain: "Share price times number of shares: the total price tag the market puts on the whole company.",
    latestExpr: "px.last_close * ttm.shares_i", periodExpr: null,
  },
  pe_ttm: {
    unit: "ratio", label: "P/E (TTM)",
    description: "Market cap / TTM net income. NULL when TTM net income ≤ 0. Latest only.",
    explain: "Price relative to a year of profit. 40x means you pay $40 for every $1 of yearly profit. A high P/E says the market expects growth. Empty when the company lost money.",
    latestExpr: "if(ttm.net_income_ttm > 0, px.last_close * ttm.shares_i / ttm.net_income_ttm, NULL)",
    periodExpr: null,
  },
  ps_ttm: {
    unit: "ratio", label: "P/S (TTM)",
    description: "Market cap / TTM revenue. Latest only.",
    explain: "Price relative to a year of sales. Useful for comparing companies when profit is thin or negative.",
    latestExpr: "px.last_close * ttm.shares_i / nullIf(ttm.revenue_ttm, 0)",
    periodExpr: null,
  },
} as const satisfies Record<string, MetricDef>;

export type MetricKey = keyof typeof METRICS;
export const METRIC_KEYS = Object.keys(METRICS) as [MetricKey, ...MetricKey[]];
export const metricDef = (key: MetricKey): MetricDef => METRICS[key];
