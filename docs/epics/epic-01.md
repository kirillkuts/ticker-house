# Epic 1 — Security master and real daily prices

```sql
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
