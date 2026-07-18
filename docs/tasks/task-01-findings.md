# Task 1 findings — Security-master data sources

Two providers cover every field in `ticker_house.securities`:

1. **SEC EDGAR** — free, no API key. Gives CIK, official name, ticker, exchange, SIC, fiscal year end, former names, address, active status.
2. **Massive** (formerly Polygon.io) — needs an API key. Gives description, website, employee count, list date, market cap, share class details, and ticker-change events. Both `api.polygon.io` and `api.massive.com` serve the same API.

Neither provider gives CEO or founded year directly. Massive's `branding`/company endpoints don't include them. Options: leave them empty for v1, or fill from the SEC DEF 14A proxy filings later. Sector/industry also need a mapping: SEC gives a SIC code, Massive gives `sic_code` + `sic_description`. Map SIC ranges to your own `sector`/`industry` labels in the ingester.

## Field mapping

| `securities` field | Source | Where |
|---|---|---|
| security_id | internal | allocated at ingest, keyed on (cik, ticker, share_class) |
| cik | SEC | `company_tickers_exchange.json` → `cik`; Massive also returns `cik` |
| ticker | SEC | `company_tickers_exchange.json` → `ticker` |
| share_class | Massive | ticker details → `share_class_figi` / ticker suffix (e.g. BRK-B) |
| company_name | SEC | `company_tickers_exchange.json` → `name` (submissions `name` is identical) |
| exchange | SEC | `company_tickers_exchange.json` → `exchange` (Nasdaq/NYSE/CBOE); Massive gives MIC codes (`primary_exchange: XNAS`) |
| symbol_history | Massive | ticker events endpoint, `types=ticker_change` |
| country_code | SEC | submissions → `addresses.business.stateOrCountry` (US default) |
| trading_currency | Massive | ticker details → `currency_name` |
| sic | SEC | submissions → `sic` |
| sic_description | SEC | submissions → `sicDescription` |
| sector / industry | derived | SIC-range mapping table in the ingester |
| website | Massive | ticker details → `homepage_url` (SEC `website` is usually empty) |
| description | Massive | ticker details → `description` |
| ceo | none | empty for v1 |
| headquarters | SEC | submissions → `addresses.business` (city + state) |
| employee_count | Massive | ticker details → `total_employees` |
| founded_year | none | empty for v1 (Massive `list_date` is IPO date, not founding) |
| fiscal_year_end | SEC | submissions → `fiscalYearEnd` (MMDD, e.g. `0926`) |
| is_active | both | present in SEC ticker file = active; Massive ticker details → `active` |
| source | internal | `sec` / `massive` |

## Endpoints

### 1. SEC ticker/exchange directory (universe + identity)

No auth. SEC requires a `User-Agent` with contact email. Rate limit: 10 req/s.

```bash
curl -s -H "User-Agent: TickerHouse kirill.kuts.dev@gmail.com" \
  https://www.sec.gov/files/company_tickers_exchange.json | jq
```

One file, ~10k rows, no pagination. Verified response (2026-07-17):

```json
{"fields":["cik","name","ticker","exchange"],
 "data":[[1045810,"NVIDIA CORP","NVDA","Nasdaq"],
         [320193,"Apple Inc.","AAPL","Nasdaq"],
         [1067983,"BERKSHIRE HATHAWAY INC","BRK-B","NYSE"], ...]}
```

Note: one CIK can appear on several rows (share classes, e.g. BRK-A/BRK-B → same CIK 1067983).

### 2. SEC company submissions (profile per company)

CIK must be zero-padded to 10 digits.

```bash
curl -s -H "User-Agent: TickerHouse kirill.kuts.dev@gmail.com" \
  https://data.sec.gov/submissions/CIK0000320193.json | jq
```

Verified response (Apple, trimmed):

```json
{"cik":"0000320193","name":"Apple Inc.","entityType":"operating",
 "sic":"3571","sicDescription":"Electronic Computers",
 "tickers":["AAPL"],"exchanges":["Nasdaq"],
 "fiscalYearEnd":"0926","stateOfIncorporation":"CA","website":"",
 "formerNames":[{"name":"APPLE COMPUTER INC","from":"1994-01-26","to":"2007-01-04"}],
 "addresses":{"business":{"street1":"ONE APPLE PARK WAY","city":"CUPERTINO",
   "stateOrCountry":"CA","zipCode":"95014"}}}
```

No pagination. For bulk loads use the nightly zip instead of 500 single calls:

```bash
curl -s -H "User-Agent: TickerHouse kirill.kuts.dev@gmail.com" \
  -o submissions.zip https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip
```

### 3. Massive ticker details (profile enrichment)

Auth: `apiKey` query param. The key lives in `.env` at the repo root (`MASSIVE_API_KEY=...`). Load it first:

```bash
export $(grep -v '^#' .env | xargs)
```

Free tier: 5 requests per minute.

```bash
curl -s "https://api.massive.com/v3/reference/tickers/AAPL?apiKey=$MASSIVE_API_KEY" | jq
```

Verified response (2026-07-17, trimmed):

```json
{"status":"OK","results":{
  "ticker":"AAPL","name":"Apple Inc.","market":"stocks","locale":"us",
  "primary_exchange":"XNAS","type":"CS","active":true,
  "currency_name":"usd","cik":"0000320193",
  "composite_figi":"BBG000B9XRY4","share_class_figi":"BBG001S5N8V8",
  "market_cap":4894708260560.0,
  "address":{"address1":"ONE APPLE PARK WAY","city":"CUPERTINO","state":"CA","postal_code":"95014"},
  "description":"Apple is among the largest companies in the world, ...",
  "sic_code":"3571","sic_description":"ELECTRONIC COMPUTERS",
  "ticker_root":"AAPL","homepage_url":"https://www.apple.com",
  "total_employees":166000,"list_date":"1980-12-12",
  "share_class_shares_outstanding":14687356000,
  "weighted_shares_outstanding":14687356000}}
```

Notes for the task 2 mapper:

- `currency_name` is lowercase (`usd`); uppercase it for `trading_currency`.
- `primary_exchange` is a MIC code (`XNAS`, `XNYS`, `ARCX`); the SEC file uses display names (`Nasdaq`, `NYSE`). Pick one convention for `securities.exchange` and map the other.
- `weighted_shares_outstanding` and `market_cap` are here too; useful later for `stock_daily_metrics`.

### 4. Massive ticker list (pagination example)

```bash
curl -s "https://api.massive.com/v3/reference/tickers?market=stocks&active=true&limit=1000&apiKey=$MASSIVE_API_KEY" | jq
```

Verified response (limit=3, trimmed):

```json
{"status":"OK","count":3,
 "results":[
  {"ticker":"A","name":"Agilent Technologies Inc.","type":"CS","primary_exchange":"XNYS","cik":"0001090872","currency_name":"usd","active":true},
  {"ticker":"AA","name":"Alcoa Corporation","type":"CS","primary_exchange":"XNYS","cik":"0001675149","currency_name":"usd","active":true},
  {"ticker":"AAA","name":"Alternative Access First Priority CLO Bond ETF","type":"ETF","primary_exchange":"ARCX","cik":"0001776878","currency_name":"usd","active":true}],
 "next_url":"https://api.massive.com/v3/reference/tickers?cursor=YWN0aXZlPXRydWUmYXA9MyZhcz0mbGltaXQ9MyZtYXJrZXQ9c3RvY2tzJnNvcnQ9dGlja2Vy"}
```

Cursor pagination: follow `next_url` (append `&apiKey=$MASSIVE_API_KEY`) until it's absent. Filter `type=CS` to exclude ETFs and other funds:

```bash
curl -s "https://api.massive.com/v3/reference/tickers?market=stocks&type=CS&active=true&limit=1000&apiKey=$MASSIVE_API_KEY" | jq
```

### 5. Massive ticker events (symbol_history)

```bash
curl -s "https://api.massive.com/vX/reference/tickers/META/events?types=ticker_change&apiKey=$MASSIVE_API_KEY" | jq
```

Verified response (2026-07-17):

```json
{"status":"OK","results":{
  "name":"Meta Platforms, Inc. Class A Common Stock",
  "composite_figi":"BBG000MM2P62","cik":"0001326801",
  "events":[
    {"type":"ticker_change","date":"2022-06-09","ticker_change":{"ticker":"META"}},
    {"type":"ticker_change","date":"2012-05-18","ticker_change":{"ticker":"FB"}}]}}
```

Each event's `date` is the day that ticker became effective. To build `symbol_history` tuples: `valid_from` = event date, `valid_to` = next event's date (or null for the latest). This is the only automated source for ticker history; SEC only tracks former company names.

Auth failure shape (verified live against both hosts):

```json
{"status":"ERROR","error":"API Key was not provided"}
```

## Ingestion order

1. SEC ticker file → universe, CIK, ticker, exchange, name, is_active.
2. SEC submissions per CIK → sic, fiscal_year_end, headquarters, former names.
3. Massive ticker details per ticker → description, website, employees, currency, share class.
4. Massive events → symbol_history.
5. SIC mapping table → sector, industry.

## Open items

- Decide the SIC → sector/industry mapping (SIC division ranges are a fine v1).
- Confirm the S&P 500 constituent list source (not in scope of this task; needed to filter the ~10k-ticker universe to ~500).
