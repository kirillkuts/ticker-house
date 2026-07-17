# Product Pitch

## Ticker House

**Ask about a stock. Get an interactive answer.**

An AI stock research workspace that converts questions into trustworthy, interactive single-stock and multi-stock dashboards backed by structured market data.

Instead of responding with another block of text, the product turns natural-language questions into dashboards that users can explore. They can ask about one stock, compare several companies, inspect a category or index, screen the market, or revisit a saved watchlist.

The initial agent acts as a router: it understands the question, chooses an appropriate predefined view, and supplies its parameters. Over time, it can evolve into a controlled dashboard composer built on a reusable widget library. Arbitrary agent-generated charts are intentionally outside the initial scope.

## Core experiences

### Single-stock dashboard

- Company name, ticker, and category
- AI-written rewards and risks with inspectable evidence
- A primary chart with toggles for price, market cap, PE, forward PE, EPS, revenue, and dividend yield
- An easy-to-understand fundamentals summary covering value, future, past, health, and dividend
- Earnings and revenue compared with the company's industry
- Valuation comparisons against its industry or competitors

### Group dashboard

- A market heatmap for quickly understanding performance across a group
- Horizontally scrolling comparison tiles for fewer than 10 stocks
- A table for larger groups and screener results
- Drill-down navigation from heatmap to sector to individual stock

### Additional workflows

- Two-stock side-by-side comparison
- Natural-language stock screening
- Saved watchlists as first-class groups
- Follow-up questions that refine or modify the current dashboard

## Data and architecture

ClickHouse stores market and fundamental data. The likely first universe is the S&P 500, with nightly price updates, weekly fundamental updates, and industry comparisons computed from the ingested universe.

The product is designed UI-first: every widget receives a precise, structured data contract. Those contracts determine which data sources are needed, how ingestion works, and what the agent is allowed to render.

The result is a stock analysis experience that combines the flexibility of asking a question with the clarity, trust, and interactivity of a purpose-built financial dashboard.
