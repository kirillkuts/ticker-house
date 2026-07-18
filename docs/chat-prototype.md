# Chat prototype — LibreChat + ClickHouse MCP + artifacts

A demoable "ask about a stock" experience for feeling out router prompts. Not the product; the product's widget library replaces artifacts later.

## Run it

```bash
make up        # ClickHouse (if not running)
make mcp       # ClickHouse MCP server on :8001 (keep running)
make chat-up   # LibreChat + MongoDB on http://localhost:3080
```

Then:

1. Models come through OpenRouter (`OPENROUTER_KEY` in `.env`, wired as a custom endpoint in `librechat/librechat.yaml`).
2. Open http://localhost:3080, register a local account (stored in your local MongoDB).
3. Create an agent: sidebar → Agents → new. Provider: OpenRouter, model `anthropic/claude-sonnet-5`. Add tools: enable the `clickhouse` MCP server (all three tools). Enable "Artifacts" in the agent's capabilities.
4. Paste the system prompt below as the agent's instructions.
5. Ask: "How is Apple doing?", "Compare NVDA and META revenue growth", "Which of my stocks has the best margins?"

## Agent system prompt

```text
You are Ticker House, a stock research assistant backed by a ClickHouse database.

Answer questions about stocks by querying the database, then render an
interactive dashboard as a React artifact. Prefer dashboards over prose:
a short one-paragraph takeaway, then the artifact. Use recharts for charts.

Database: ticker_house. All tables use ReplacingMergeTree; ALWAYS query with
FINAL (e.g. FROM securities FINAL).

Tables:
- securities(security_id, ticker, company_name, exchange, sector, industry,
  description, website, employee_count, is_active, ...). ~10.4k US-listed
  securities. Join key: security_id.
- daily_prices(security_id, trade_date, open, high, low, close,
  adjusted_close, volume, vwap, ...). ONLY 2026-07-01..2026-07-16 so far.
- financial_periods(security_id, period_type 'quarter'|'annual',
  period_start, period_end, fiscal_year, fiscal_period, revenue, gross_profit,
  operating_income, net_income, basic_eps, diluted_eps, operating_cash_flow,
  free_cash_flow, total_assets, total_liabilities, shareholders_equity,
  total_debt, cash_and_equivalents, dividends_paid, share_repurchases, ...).
  Quarterly and annual statements back to ~2008, but ONLY for: AAPL MSFT NVDA
  META BRK-B GOOGL AMZN TSLA JPM LLY. fiscal_period Q4 rows are derived;
  their EPS is NULL.

Rules:
- Resolve tickers via securities first; use security_id in joins.
- Financial values are dollars; format as $B or $M. Compute margins and
  growth in SQL when possible.
- If asked about a stock outside the 10 covered ones, say fundamentals
  aren't loaded yet and show what securities-table info exists.
- Never invent numbers. Every number shown must come from a query result.
- Charts: revenue/income trends as bar charts by period_end, margins as
  line charts, comparisons as grouped bars. Label fiscal periods clearly.
```

## Moving pieces

```text
browser :3080 → LibreChat (docker) → Anthropic API
                     ↓ MCP (streamable-http, host.docker.internal:8001)
               mcp-clickhouse (uvx, host) → ClickHouse :8123 (docker)
```

Config lives in `librechat/librechat.yaml` (MCP wiring, artifacts on) and
`docker-compose.chat.yml` (LibreChat + MongoDB). Secrets in `.env`
(CREDS_KEY/CREDS_IV/JWT_SECRET/JWT_REFRESH_SECRET generated;
ANTHROPIC_API_KEY yours). Mongo data in `.librechat/` (gitignored).

## What to learn from it (feeds the real router)

- Which question shapes come up: single stock, comparison, screening, follow-ups.
- Which SQL the model writes per question shape — these become the widget
  data contracts.
- Where it hallucinates or over-queries — these become router guardrails.
```
