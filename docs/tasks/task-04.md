# Task 4 — Normalize and ingest daily prices

Define how price and corporate-action data are transformed and loaded into
`ticker_house.daily_prices`.

## Output

- Source-field to ClickHouse-column mapping.
- Trading-date and historical-symbol resolution rules.
- Split, dividend, and adjusted-close calculation rules.
- Missing-data and unresolved-symbol handling.
- Versioned, replay-safe batched ClickHouse insert process.
- Data-quality checks.
