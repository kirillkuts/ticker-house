# Ticker House

Ask about a stock. Get an interactive answer.

An AI stock research workspace: natural-language questions become interactive
dashboards backed by structured market data in ClickHouse. The agent routes a
question to a predefined view and fills in its parameters; prebuilt widgets
render real query results. The model never generates UI code or numbers.
Full pitch: [docs/pitch.md](docs/pitch.md).

## Layout

```text
docs/            pitch, data-source and ClickHouse notes, references
src/             data ingestion (TypeScript, run via npm scripts)
  lib/           fetchers, normalizers, ClickHouse loaders
  cli/           entry points for the sync commands
web/             the app: Next.js + Trigger.dev chat agent + widgets
  trigger/       ticker-chat agent (router prompt + view tools)
  lib/views.ts   data contracts: one fixed SQL query per view
  components/    chat UI and dashboard widgets (recharts)
data/            universe.txt (enriched tickers); raw snapshots gitignored
```

## Data pipeline

ClickHouse (local, Docker) holds four tables: `securities` (SEC + Massive),
`daily_prices` (Massive grouped daily + splits/dividends), `financial_facts`
and `financial_periods` (SEC XBRL company facts). All are
`ReplacingMergeTree`, insert-only, replay-safe.

```bash
make up                     # ClickHouse on :8123 / :9000
npm install
npm run sync:securities     # full SEC universe + enrichment for data/universe.txt
npm run sync:prices -- --from 2026-07-01 --to 2026-07-16
npm run sync:financials     # fundamentals for the universe tickers
```

Secrets go in `.env` (gitignored); copy `.env.example` to start.
`MASSIVE_API_KEY` powers prices and profile enrichment. SEC endpoints need no
key, but set `SEC_USER_AGENT` to a real contact email — SEC's fair-access
policy requires a descriptive User-Agent.

## The app

```bash
cd web && npm install
# web/.env.local (and web/.env for the trigger worker):
#   TRIGGER_PROJECT_REF, TRIGGER_SECRET_KEY, OPENROUTER_KEY, CLICKHOUSE_*
npx trigger.dev@latest dev   # terminal 1: runs the chat agent locally
npm run dev                  # terminal 2: http://localhost:3000
```

How a question flows: browser (`useChat` + Trigger transport) → Trigger.dev
session task → Claude via OpenRouter picks a view tool (~40 output tokens) →
the tool runs its fixed ClickHouse query → the result streams back as a tool
part → the matching widget renders it. Views so far: single-stock price,
fundamentals.

Adding a view = query in `web/lib/views.ts` + tool in `web/trigger/chat.ts`
+ widget in `web/components/widgets/` + a branch in `ToolPart`.
