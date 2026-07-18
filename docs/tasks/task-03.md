# Task 3 — Find daily-price data sources

Determine which provider files and endpoints supply daily OHLCV prices, VWAP,
transaction counts, splits, and dividend adjustments.

## Output

- Source-to-field mapping.
- Working `curl` or object-storage commands for historical backfills and daily
  updates.
- Authentication and pagination examples.
- Example responses and files using real securities and trading dates.

## Findings

Provider: Massive (formerly Polygon.io). One provider covers everything the
`daily_prices` table needs: OHLCV, VWAP, transaction counts, splits, and
dividend adjustment factors.

Four sources, each with a distinct role:

| Source | Role |
|---|---|
| S3 flat files, `us_stocks_sip/day_aggs_v1` | Historical backfill. One CSV per trading day, all US stocks. |
| REST grouped daily (`/v2/aggs/grouped/...`) | Nightly update. One call returns the whole market for one date. |
| REST splits (`/stocks/v1/splits`) | `split_factor` and split-adjustment history. |
| REST dividends (`/stocks/v1/dividends`) | `dividend_adjustment` history. |

### Authentication

REST: append `apiKey=<KEY>` as a query parameter, or send header
`Authorization: Bearer <KEY>`.

Flat files: S3 access key and secret, generated in the Massive dashboard.
Anonymous access is refused. Verified 2026-07-17: an unsigned request to
`https://files.massive.com/flatfiles?list-type=2&prefix=us_stocks_sip/day_aggs_v1/`
returns `403`.

Plan requirement: flat-file day aggregates need a paid Stocks plan
(Starter gives 5 years of history, Advanced/Business give all history).
Files for a trading day appear by ~11:00 ET the next day.

### 1. Historical backfill — flat files

S3 endpoint `https://files.massive.com`, bucket `flatfiles`.
Path scheme: `us_stocks_sip/day_aggs_v1/YYYY/MM/YYYY-MM-DD.csv.gz`.

```bash
# credentials from the Massive dashboard
export AWS_ACCESS_KEY_ID=<massive-access-key>
export AWS_SECRET_ACCESS_KEY=<massive-secret>

# list one month
aws s3 ls s3://flatfiles/us_stocks_sip/day_aggs_v1/2026/06/ \
  --endpoint-url https://files.massive.com

# download one trading day
aws s3 cp s3://flatfiles/us_stocks_sip/day_aggs_v1/2026/06/2026-06-15.csv.gz . \
  --endpoint-url https://files.massive.com
```

CSV columns: `ticker`, `volume`, `open`, `close`, `high`, `low`,
`window_start` (Unix nanoseconds, start of the trading day), `transactions`.

Note: flat files have no VWAP column and prices are unadjusted.

### 2. Nightly update — grouped daily endpoint

```bash
curl "https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/2026-06-15?adjusted=false&apiKey=<KEY>"
```

`adjusted=false` because we store raw prices and keep adjustment factors in
separate columns. One response row per ticker.

Verified 2026-07-17 on the free tier: one call for 2026-07-15 returned
`resultsCount: 12435` — the whole US market in a single response.

```json
{
  "status": "OK",
  "adjusted": false,
  "resultsCount": 12435,
  "results": [
    {
      "T": "AAPL",
      "o": 317.615, "h": 328.73, "l": 317.32, "c": 327.5,
      "v": 60957644.06,
      "vw": 325.8418,
      "n": 1053423,
      "t": 1784145600000
    }
  ]
}
```

Note: `v` (volume) arrives as a float, not an integer; round before storing
into `volume UInt64`.

### 3. Splits

```bash
curl "https://api.massive.com/stocks/v1/splits?ticker=AAPL&limit=10&sort=execution_date.desc&apiKey=<KEY>"
```

Verified response (2026-07-17):

```json
{
  "status": "OK",
  "results": [
    {"ticker": "AAPL", "adjustment_type": "forward_split",
     "execution_date": "2020-08-31", "split_from": 1.0, "split_to": 4.0,
     "historical_adjustment_factor": 0.25},
    {"ticker": "AAPL", "adjustment_type": "forward_split",
     "execution_date": "2014-06-09", "split_from": 1.0, "split_to": 7.0,
     "historical_adjustment_factor": 0.035714},
    {"ticker": "AAPL", "adjustment_type": "forward_split",
     "execution_date": "2005-02-28", "split_from": 1.0, "split_to": 2.0,
     "historical_adjustment_factor": 0.017857}
  ]
}
```

`split_from`/`split_to` are floats.

Filters: `ticker`, `execution_date` (with `.gt/.gte/.lt/.lte`),
`adjustment_type` (`forward_split`, `reverse_split`, `stock_dividend`).
`limit` max 5000. For daily incremental pulls, filter
`execution_date.gte=<yesterday>` with no ticker filter.

### 4. Dividends

```bash
curl "https://api.massive.com/stocks/v1/dividends?ticker=AAPL&limit=10&sort=ex_dividend_date.desc&apiKey=<KEY>"
```

Verified response (2026-07-17):

```json
{
  "status": "OK",
  "results": [
    {
      "ticker": "AAPL",
      "cash_amount": 0.27,
      "split_adjusted_cash_amount": 0.27,
      "currency": "USD",
      "declaration_date": "2026-04-30",
      "ex_dividend_date": "2026-05-11",
      "record_date": "2026-05-11",
      "pay_date": "2026-05-14",
      "frequency": 4,
      "distribution_type": "recurring",
      "historical_adjustment_factor": 0.99908
    }
  ],
  "next_url": "https://api.massive.com/stocks/v1/dividends?cursor=AQwPBEFBUEw..."
}
```

### Pagination

List endpoints use cursor pagination. When a response is truncated it
contains `next_url`; call it with the same auth until it disappears.
The grouped-daily endpoint returns the full market in one response, so it
does not paginate.

### Source-to-field mapping (`ticker_house.daily_prices`)

| Column | Source | Field |
|---|---|---|
| `security_id` | internal | resolved from `source_symbol` via `securities.symbol_history` (task 4) |
| `trade_date` | flat file / grouped daily | `window_start` (ns) / `t` (ms), truncated to date in ET |
| `open`, `high`, `low`, `close` | both | `open/high/low/close` (CSV), `o/h/l/c` (REST), unadjusted |
| `adjusted_close` | computed | `close × cumulative split and dividend factors` (task 4) |
| `volume` | both | `volume` / `v` |
| `transaction_count` | both | `transactions` / `n` |
| `vwap` | grouped daily only | `vw`; NULL for flat-file backfill rows |
| `split_factor` | splits endpoint | `split_to / split_from` on `execution_date`, else 1 |
| `dividend_adjustment` | dividends endpoint | from `historical_adjustment_factor` on `ex_dividend_date`, else 1 |
| `source_symbol` | both | `ticker` / `T` |
| `source` | constant | `massive` |

Both splits and dividends expose `historical_adjustment_factor`, a cumulative
factor that normalizes any historical price to today's share basis. Exact
adjusted-close math is task 4.

### Gaps and caveats

- Flat-file rows lack VWAP. Either accept NULL `vwap` for backfilled history
  or backfill VWAP through per-ticker REST aggregates
  (`/v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}` — verified working,
  returns `vw` per day, `adjusted=false` supported).
- All four REST endpoints verified live on the free tier 2026-07-17
  (grouped daily, splits, dividends, per-ticker range). Flat files still
  need a paid plan and remain unverified.
- Grouped daily works on the free tier. Historical backfill can therefore
  use grouped daily instead of flat files: one call per trading day,
  ~252 calls per year of history, at 5 calls/min ≈ 50 minutes per year of
  backfill. Slower than flat files but $0.
- Free tier is 5 calls/minute, end-of-day data, and about 2 years of
  history. Starter ($29/mo class) adds flat files with 5 years of history.
