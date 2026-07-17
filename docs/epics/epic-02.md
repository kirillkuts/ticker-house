# Epic 2 — Normalized financial statements

```sql
CREATE TABLE ticker_house.financial_periods
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

    revenue Nullable(Decimal(24, 2)),
    cost_of_revenue Nullable(Decimal(24, 2)),
    gross_profit Nullable(Decimal(24, 2)),

    research_and_development Nullable(Decimal(24, 2)),
    selling_general_admin Nullable(Decimal(24, 2)),
    operating_expenses Nullable(Decimal(24, 2)),

    operating_income Nullable(Decimal(24, 2)),
    interest_expense Nullable(Decimal(24, 2)),
    pretax_income Nullable(Decimal(24, 2)),
    income_tax Nullable(Decimal(24, 2)),
    net_income Nullable(Decimal(24, 2)),

    basic_eps Nullable(Decimal(18, 6)),
    diluted_eps Nullable(Decimal(18, 6)),
    basic_weighted_shares Nullable(UInt64),
    diluted_weighted_shares Nullable(UInt64),

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
    long_term_liabilities Nullable(Decimal(24, 2)),
    total_liabilities Nullable(Decimal(24, 2)),
    shareholders_equity Nullable(Decimal(24, 2)),

    operating_cash_flow Nullable(Decimal(24, 2)),
    capital_expenditure Nullable(Decimal(24, 2)),
    free_cash_flow Nullable(Decimal(24, 2)),

    acquisitions Nullable(Decimal(24, 2)),
    share_based_compensation Nullable(Decimal(24, 2)),
    dividends_paid Nullable(Decimal(24, 2)),
    share_repurchases Nullable(Decimal(24, 2)),
    debt_issued Nullable(Decimal(24, 2)),
    debt_repaid Nullable(Decimal(24, 2)),

    source LowCardinality(String) DEFAULT 'sec',
    source_accession String,
    source_concepts Map(String, String) DEFAULT map(),
    mapping_version LowCardinality(String),
    is_amendment Bool DEFAULT false,

    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3),
    version UInt64
)
ENGINE = ReplacingMergeTree(version)
ORDER BY (security_id, period_type, period_end);
```
