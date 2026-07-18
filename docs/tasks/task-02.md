# Task 2 — Normalize and ingest securities

Define how provider responses are transformed and loaded into
`ticker_house.securities`.

## Output

- Source-field to ClickHouse-column mapping.
- Security matching and `security_id` allocation rules.
- `symbol_history` construction rules.
- Missing-data and ambiguous-match handling.
- Versioned, replay-safe ClickHouse insert process.
- Data-quality checks.
