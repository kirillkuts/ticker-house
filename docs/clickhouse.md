# ClickHouse Ingestion and Schema

Use a layered model:

```text
SEC / Massive
      ↓
Raw files for replay
      ↓
Canonical ClickHouse tables
      ↓
Derived dashboard tables
      ↓
Ticker House API
```

Keep the original SEC ZIP/JSON and Massive CSV files outside ClickHouse—local object storage or MinIO is enough initially. ClickHouse should contain typed, queryable records rather than being the only copy of raw provider payloads.

## Rules checked

- `schema-pk-plan-before-creation` — query-driven ordering keys defined below.
- `schema-pk-cardinality-order` — keys progress from security/metric identifiers to dates and versions.
- `schema-pk-prioritize-filters` — `security_id` leads tables queried by stock.
- `schema-types-native-types` — dates, money, counts, and booleans use native types.
- `schema-types-minimize-bitwidth` — IDs and counts use appropriately sized integers.
- `schema-types-lowcardinality` — providers, exchanges, concepts, industries, and forms use `LowCardinality`.
- `schema-types-avoid-nullable` — `Nullable` is limited to cases where missing differs from zero.
- `schema-partition-start-without` — no partitioning initially; the S&P 500 dataset is relatively small.
- `schema-json-when-to-use` — known fields are typed; raw JSON remains an external replay artifact.
- `insert-batch-size` — historical loads use 10,000–100,000-row batches.
- `insert-mutation-avoid-update` — corrections arrive as new versions through `ReplacingMergeTree`.
- `query-join-consider-alternatives` — a denormalized serving table prevents dashboard-time joins.

## 1. Security master

Do not use ticker as the primary identity. One issuer can have multiple securities, and tickers can change.

```sql
CREATE DATABASE IF NOT EXISTS ticker_house;

CREATE TABLE ticker_house.securities
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
ORDER BY security_id;
```

`version` should be a monotonically increasing ingestion revision, such as the ingestion timestamp in milliseconds.

`ticker` and `exchange` contain the current display values. `symbol_history` keeps every
known ticker/exchange interval on the same denormalized security row. Within each tuple,
`valid_to` is legitimately nullable: null means the symbol is still active.

When symbol history changes, insert a complete new `securities` row with a higher
`version`. Use the array to resolve a provider symbol for a particular trading date.

## 2. Daily market prices

```sql
CREATE TABLE ticker_house.daily_prices
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
ORDER BY (security_id, trade_date);
```

This ordering matches the primary chart query:

```sql
SELECT
    trade_date,
    open,
    high,
    low,
    close,
    adjusted_close,
    volume
FROM ticker_house.daily_prices FINAL
WHERE security_id = 42
  AND trade_date >= today() - INTERVAL 5 YEAR
ORDER BY trade_date;
```

Per `schema-pk-prioritize-filters`, `security_id` comes first because most product queries select one company or a known group before filtering by date.

Do not partition this table yet. Five years of daily prices for 500 companies is only roughly 630,000 rows. Per `schema-partition-start-without`, partitioning adds little value until you have a real retention or archival requirement.

## 3. Raw SEC numeric facts

SEC Company Facts is concept-oriented. Preserve that representation before mapping concepts into your normalized statements.

```sql
CREATE TABLE ticker_house.financial_facts
(
    security_id UInt32,

    taxonomy LowCardinality(String),
    concept LowCardinality(String),
    unit LowCardinality(String),

    value Decimal(38, 8),

    period_start Nullable(Date),
    period_end Date,
    filed_date Date,
    accepted_at Nullable(DateTime64(3, 'UTC')),

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
ORDER BY
(
    security_id,
    concept,
    period_end,
    period_start,
    accession,
    unit
);
```

`period_start` is legitimately nullable because balance-sheet facts are instantaneous while income and cash-flow facts cover durations.

Example records:

```text
security_id  concept                   period_end  fiscal_period  value
42           Revenues                  2026-04-27  Q1             44060000000
42           NetIncomeLoss             2026-04-27  Q1             23300000000
42           CashAndCashEquivalents    2026-04-27  Q1             53700000000
```

## 4. Normalized financial periods

The raw XBRL facts are difficult for the UI to query. Transform the concepts you support into one wide row per reporting period.

This is intentionally denormalized. Per `query-join-consider-alternatives`, the dashboard should not join three statement tables for every request.

```sql
CREATE TABLE ticker_house.financial_periods
(
    security_id UInt32,

    period_type LowCardinality(String), -- quarter or annual
    period_start Date,
    period_end Date,
    filing_date Date,

    fiscal_year UInt16,
    fiscal_period LowCardinality(String),
    form LowCardinality(String),
    currency FixedString(3),

    -- Income statement
    revenue Nullable(Decimal(24, 2)),
    cost_of_revenue Nullable(Decimal(24, 2)),
    gross_profit Nullable(Decimal(24, 2)),
    operating_income Nullable(Decimal(24, 2)),
    interest_expense Nullable(Decimal(24, 2)),
    pretax_income Nullable(Decimal(24, 2)),
    income_tax Nullable(Decimal(24, 2)),
    net_income Nullable(Decimal(24, 2)),

    basic_eps Nullable(Decimal(18, 6)),
    diluted_eps Nullable(Decimal(18, 6)),
    basic_weighted_shares Nullable(UInt64),
    diluted_weighted_shares Nullable(UInt64),

    -- Balance sheet
    cash_and_equivalents Nullable(Decimal(24, 2)),
    short_term_investments Nullable(Decimal(24, 2)),
    accounts_receivable Nullable(Decimal(24, 2)),
    inventory Nullable(Decimal(24, 2)),
    current_assets Nullable(Decimal(24, 2)),
    total_assets Nullable(Decimal(24, 2)),

    accounts_payable Nullable(Decimal(24, 2)),
    current_liabilities Nullable(Decimal(24, 2)),
    short_term_debt Nullable(Decimal(24, 2)),
    long_term_debt Nullable(Decimal(24, 2)),
    total_debt Nullable(Decimal(24, 2)),
    total_liabilities Nullable(Decimal(24, 2)),
    shareholders_equity Nullable(Decimal(24, 2)),

    -- Cash flow
    operating_cash_flow Nullable(Decimal(24, 2)),
    capital_expenditure Nullable(Decimal(24, 2)),
    free_cash_flow Nullable(Decimal(24, 2)),
    dividends_paid Nullable(Decimal(24, 2)),
    share_repurchases Nullable(Decimal(24, 2)),
    share_based_compensation Nullable(Decimal(24, 2)),

    source_accession String,
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3),
    version UInt64
)
ENGINE = ReplacingMergeTree(version)
ORDER BY (security_id, period_type, period_end);
```

The nullable financial columns are justified: missing data is not equivalent to a reported value of zero.

## 5. XBRL concept mapping

You need a controlled mapping from SEC concepts into normalized fields.

```sql
CREATE TABLE ticker_house.financial_concept_map
(
    normalized_field LowCardinality(String),
    taxonomy LowCardinality(String),
    concept LowCardinality(String),

    statement LowCardinality(String),
    priority UInt8,
    is_duration Bool,
    sign_multiplier Int8 DEFAULT 1,

    valid_from Date DEFAULT toDate('2009-01-01'),
    valid_to Nullable(Date)
)
ENGINE = MergeTree
ORDER BY (normalized_field, priority, concept);
```

Example mappings:

```text
normalized_field       taxonomy  concept
revenue                 us-gaap   RevenueFromContractWithCustomerExcludingAssessedTax
revenue                 us-gaap   Revenues
net_income              us-gaap   NetIncomeLoss
cash_and_equivalents    us-gaap   CashAndCashEquivalentsAtCarryingValue
shareholders_equity     us-gaap   StockholdersEquity
operating_cash_flow     us-gaap   NetCashProvidedByUsedInOperatingActivities
capital_expenditure     us-gaap   PaymentsToAcquirePropertyPlantAndEquipment
```

The ingestion transformer selects the available concept with the highest priority for each company and period.

## 6. Dashboard-serving table

The application should not calculate TTM results and valuation ratios on every request. Build a denormalized daily table after price and financial ingestion completes.

```sql
CREATE TABLE ticker_house.stock_daily_metrics
(
    security_id UInt32,
    metric_date Date,

    close Decimal(18, 6),
    day_change_pct Nullable(Decimal(12, 6)),

    shares_outstanding Nullable(UInt64),
    market_cap Nullable(Decimal(24, 2)),

    revenue_ttm Nullable(Decimal(24, 2)),
    net_income_ttm Nullable(Decimal(24, 2)),
    diluted_eps_ttm Nullable(Decimal(18, 6)),
    free_cash_flow_ttm Nullable(Decimal(24, 2)),

    gross_margin Nullable(Decimal(12, 6)),
    operating_margin Nullable(Decimal(12, 6)),
    net_margin Nullable(Decimal(12, 6)),

    trailing_pe Nullable(Decimal(18, 6)),
    price_to_sales Nullable(Decimal(18, 6)),
    dividend_yield Nullable(Decimal(12, 6)),

    financial_period_end Nullable(Date),

    computed_at DateTime64(3, 'UTC') DEFAULT now64(3),
    version UInt64
)
ENGINE = ReplacingMergeTree(version)
ORDER BY (security_id, metric_date);
```

This table feeds:

- Header KPIs
- Price and valuation chart toggles
- Market heatmap
- Comparison tiles
- Screener
- Historical PE chart

Later, add `industry_daily_metrics` containing industry medians, percentiles, and company counts.

## Ingestion process

### Nightly prices

```text
Download Massive daily file
    → validate columns and trading date
    → resolve ticker through securities.symbol_history
    → insert all securities as one batch
    → recompute stock_daily_metrics for that date
```

### Nightly SEC process

```text
Download companyfacts.zip
    → detect changed CIKs
    → extract numeric facts
    → insert new financial_facts versions
    → normalize affected reporting periods
    → insert new financial_periods versions
    → recompute affected TTM metrics and ratios
```

### Security master

```text
Download SEC ticker/exchange file
    → reconcile with Nasdaq directory
    → allocate security_id for new listings
    → rebuild symbol_history when a ticker or exchange interval changes
    → insert the complete securities row as a new version
```

## Insert strategy

Per `insert-batch-size`:

- Historical prices: 10,000–100,000 rows per insert.
- SEC facts: 10,000–100,000 rows per insert.
- Daily S&P 500 prices: insert the complete universe once, not one ticker at a time.
- Prefer ClickHouse Native or RowBinary format over JSONEachRow.

For corrections, insert a new record with a higher `version`. Do not run `ALTER TABLE UPDATE`. `ReplacingMergeTree` will deduplicate during background merges.

Until merging completes, query versioned tables with either:

```sql
SELECT ...
FROM ticker_house.daily_prices FINAL
WHERE security_id = 42;
```

or `argMax(column, version)` for larger aggregations.

Do not schedule `OPTIMIZE TABLE ... FINAL`; per `insert-optimize-avoid-final`, background merges should handle parts naturally.
