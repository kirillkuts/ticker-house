To build the current single-stock dashboard, you need seven underlying datasets: company master data, prices, financial statements, analyst estimates, corporate events, ownership, and peer/industry classifications.

## Data required by dashboard section

| Section | Required data points |
|---|---|
| Company header | Company name, ticker, exchange, currency, sector, industry, current price, previous close, absolute/percentage change, quote timestamp, market cap |
| KPI snapshot | TTM revenue, TTM net income, diluted EPS, trailing PE, forward PE, net margin, next earnings date |
| AI thesis | Rewards/risks, referenced metrics, comparison value, benchmark or peer group, reporting period, source, evidence text, confidence, calculation method |
| Price and catalysts | Daily OHLCV, adjusted close, shares outstanding, daily market cap and valuation multiples; earnings, dividend, product, regulatory, and investor events |
| Fundamentals summary | Value, future, past, health, and dividend scores; component metrics, scoring-rule version, explanation |
| Growth and profitability | Revenue, gross profit, operating income, net income, EPS, operating cash flow, capital expenditure, free cash flow, margins, historical growth, forecast growth |
| Valuation | Historical PE, forward PE, price-to-sales, current peer multiples, industry distributions, historical median and percentile |
| Financial health | Cash, investments, debt, equity, assets, liabilities, operating cash flow, free cash flow, interest expense, liquidity and leverage ratios |
| Dividends | Dividend per share, yield, declaration/ex-dividend/record/payment dates, payout ratio, FCF payout ratio, growth history, payment streak |
| Company and ownership | Description, founded date, employees, CEO, headquarters, website, business segments, geographic exposure, institutional/insider/public ownership, major holders |

## 1. Security and company master

One current record per listed security:

- Stable internal `security_id`
- Company/legal-entity ID
- Ticker and historical tickers
- Company name
- Exchange and country
- Trading currency
- Security type
- Sector, industry, and sub-industry
- Index membership
- Active/delisted status
- Listing date
- Fiscal year-end
- Website
- Business description
- Headquarters
- Founded year
- Employee count
- CEO and key executives
- Reporting currency

You should maintain ticker history because tickers and exchanges can change.

## 2. Market-price history

At minimum, one row per security per trading day:

- Trading date
- Open
- High
- Low
- Close
- Adjusted close
- Volume
- Previous close
- Split-adjustment factor
- Dividend-adjustment factor
- Shares outstanding
- Free-float shares, when available
- Market capitalization
- Data timestamp and source

Intraday data is optional for v1. Daily closing prices are enough for most dashboard charts.

## 3. Financial statements

Store quarterly and annual values separately, with both originally reported and restated values when available.

### Income statement

- Revenue
- Cost of revenue
- Gross profit
- Research and development
- Sales/general/administrative expenses
- Operating expenses
- Operating income
- Interest expense
- Pretax income
- Income tax
- Net income
- Basic EPS
- Diluted EPS
- Basic and diluted weighted-average shares

### Balance sheet

- Cash and cash equivalents
- Short-term investments
- Accounts receivable
- Inventory
- Current assets
- Total assets
- Accounts payable
- Current liabilities
- Short-term debt
- Long-term debt
- Total debt
- Long-term liabilities
- Total liabilities
- Shareholders’ equity

### Cash-flow statement

- Cash from operations
- Capital expenditure
- Acquisitions
- Share-based compensation
- Dividends paid
- Share repurchases
- Debt issuance and repayment

Every observation also needs:

- Fiscal period
- Period start/end dates
- Quarterly or annual designation
- Filing/publication date
- Currency and units
- Filing/source identifier
- Restatement status

## 4. Analyst estimates

Required for “future” scores, forward valuation, and catalysts:

- Estimated quarterly and annual revenue
- Estimated EPS
- Estimated EBITDA or operating income, if used
- Estimated free cash flow
- Number of contributing analysts
- Estimate high, low, median, and mean
- Previous consensus value
- Estimate revision date
- Long-term growth estimate
- Analyst price-target high, low, median, and mean
- Recommendation distribution
- Forecast period

Keep estimate history rather than only the latest value. That lets the dashboard show improving or declining expectations.

## 5. Earnings and corporate events

- Earnings announcement date and time
- Confirmed versus estimated date
- Reported revenue and EPS
- Consensus revenue and EPS
- Revenue and EPS surprise
- Guidance values and ranges
- Dividend declaration date
- Ex-dividend date
- Record date
- Payment date
- Split date and ratio
- Investor days
- Shareholder meetings
- Product launches
- Regulatory decisions
- Management changes

Manually curated product and regulatory catalysts can wait until after v1.

## 6. Ownership

Ownership observations should be dated because holdings change:

- Holder name
- Holder type
- Shares held
- Ownership percentage
- Position value
- Change in shares
- Filing date
- Effective/as-of date

Aggregate these into:

- Institutional ownership
- Insider ownership
- Public/retail ownership
- Top holders
- Ownership concentration

Optional later data:

- Insider purchases and sales
- Transaction price
- Transaction date
- Executive relationship
- Form/filing reference

## 7. Peer and industry data

Every comparison requires a reproducible benchmark definition:

- Peer-set ID
- Peer security IDs
- Peer-selection method
- Sector and industry classification
- Market-cap range
- Geography
- Inclusion/exclusion rules
- Effective date
- Version

For each benchmark, calculate:

- Median
- Mean
- Percentiles
- Observation count
- Minimum and maximum
- Number of excluded companies
- Exclusion reason, such as negative earnings

This prevents vague statements like “above peers” from using an invisible or changing comparison group.

## Derived metrics

These should be calculated internally rather than sourced as unrelated numbers:

```text
Daily change        = close / previous close - 1
Market cap          = price × diluted shares outstanding
TTM value           = sum of latest four quarters
Gross margin        = gross profit / revenue
Operating margin    = operating income / revenue
Net margin          = net income / revenue
Free cash flow      = operating cash flow - capital expenditure
FCF margin          = free cash flow / revenue
Trailing PE         = price / diluted TTM EPS
Forward PE          = price / forecast next-12-month EPS
Price-to-sales      = market cap / TTM revenue
Debt-to-equity      = total debt / shareholders’ equity
Net cash            = cash + investments - total debt
Interest coverage   = EBIT / interest expense
Dividend yield      = annualized dividend per share / price
EPS payout ratio    = dividend per share / diluted EPS
FCF payout ratio    = dividends paid / free cash flow
YoY growth          = current period / comparable prior period - 1
CAGR                = (ending / beginning)^(1 / years) - 1
Historical percentile = rank of current multiple in its history
```

## AI-generated conclusion contract

Each reward, risk, or summary should be stored as a structured object—not merely text:

```json
{
  "type": "risk",
  "claim": "Trades at 3.1× the semiconductor industry median PE",
  "metric": "trailing_pe",
  "company_value": 55.0,
  "benchmark_value": 18.0,
  "benchmark_id": "large_cap_semiconductors_v1",
  "period": "TTM",
  "as_of": "2026-07-17",
  "source_ids": ["filing_123", "price_2026_07_17"],
  "method": "calculated",
  "confidence": 0.98
}
```

The UI can generate readable prose from this structure while keeping the evidence inspectable.

## Data-quality metadata

Every sourced value should carry:

- Provider
- Provider symbol
- Source record or filing ID
- Effective/as-of date
- Ingestion timestamp
- Reporting currency
- Display currency
- Units and scale
- Adjustment status
- Restatement status
- Estimated versus reported status
- Null/missing-data reason

## Suggested refresh cadence

- Prices and market cap: nightly for v1
- Corporate events: daily
- Financial statements: daily ingestion checks after filings
- Analyst estimates: daily or weekly
- Company profiles: monthly
- Ownership: quarterly or when filings arrive
- Industry benchmarks and scores: recompute after relevant updates
- AI thesis: regenerate when material inputs change

The smallest viable data model is therefore:

1. `securities`
2. `daily_prices`
3. `financial_periods`
4. `financial_facts`
5. `analyst_estimates`
6. `corporate_events`
7. `dividends`
8. `ownership`
9. `peer_sets`
10. `derived_metrics`
11. `fundamental_scores`
12. `ai_insights`

That dataset supports the full dashboard while keeping every visual and AI claim traceable to structured evidence.
