import { chat } from "@trigger.dev/sdk/ai";
import { streamText, stepCountIs, tool } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import type { InferChatUIMessageFromTools } from "@trigger.dev/sdk/ai";
import { singleStockPrice, fundamentals, RANGES } from "../lib/views";
import { METRICS, METRIC_KEYS } from "../lib/metric-registry";
import { runMetricQuery } from "../lib/metric-query";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_KEY });

const SYSTEM = `You are Ticker House, a stock research assistant.

Answer questions about stocks by rendering predefined dashboard views via
tools. NEVER invent numbers; the tools return the real data and the UI
renders it. After a tool call, write ONE short paragraph of takeaways based
strictly on the tool result — no restating every number.

Coverage: prices exist only for 2026-07-01..2026-07-16 (use range "7d" or
"1m"). Fundamentals and metrics (back to ~2008) exist only for: AAPL MSFT
NVDA META BRK-B GOOGL AMZN TSLA JPM LLY. For anything outside coverage, say
so briefly instead of calling a tool.

Tool choice: use query_metrics for ratios, screens, rankings, and
multi-stock comparisons ("which stocks...", "compare X and Y", "rank by...").
Use show_price_chart / show_fundamentals for a single stock's price action or
statement history. P/E and other "latest" metrics are TTM-based; some metrics
can be NULL for a stock (missing source data), and filters exclude NULL rows.

If no view fits the question, answer in plain text.`;

export const tools = {
  show_price_chart: tool({
    description:
      "Render a price dashboard for one stock: OHLC chart, volume, and KPI tiles. Use for any question about a stock's price, performance, or recent movement.",
    inputSchema: z.object({
      ticker: z.string().describe("Stock ticker, e.g. NVDA"),
      range: z.enum(Object.keys(RANGES) as [string, ...string[]]).describe("Time range"),
    }),
    execute: async ({ ticker, range }) => singleStockPrice(ticker, range as keyof typeof RANGES),
  }),
  show_fundamentals: tool({
    description:
      "Render a fundamentals dashboard for one stock: revenue, net income, EPS, free cash flow, and margin per period. Use for questions about earnings, revenue, profitability, or financial history.",
    inputSchema: z.object({
      ticker: z.string().describe("Stock ticker, e.g. AAPL"),
      periodType: z.enum(["quarter", "annual"]).describe("Quarterly or annual statements"),
    }),
    execute: async ({ ticker, periodType }) => fundamentals(ticker, periodType),
  }),
  query_metrics: tool({
    description: [
      "Screen, compare, or rank stocks on precomputed financial metrics, or fetch a metric snapshot / time series. Use for questions about ratios (P/E, margins, ROE, debt), rankings, screens ('which stocks have...'), and multi-stock comparisons. Rows where a filtered metric is NULL are excluded — mention this if results look incomplete.",
      "Available metrics: " + METRIC_KEYS.map((k) => `${k} (${METRICS[k].description})`).join("; "),
    ].join("\n"),
    inputSchema: z.object({
      metrics: z.array(z.enum(METRIC_KEYS)).min(1).max(8).describe("Metric keys to return"),
      tickers: z.array(z.string()).max(50).optional().describe("Restrict to these tickers; required for time series (max 8 there)"),
      filters: z
        .array(z.object({
          field: z.enum(METRIC_KEYS),
          op: z.enum(["gt", "gte", "lt", "lte", "eq"]),
          value: z.number(),
        }))
        .max(5)
        .optional()
        .describe("Numeric conditions; only with period 'latest'"),
      sort: z
        .object({ field: z.enum(METRIC_KEYS), dir: z.enum(["asc", "desc"]) })
        .optional()
        .describe("Only with period 'latest'"),
      limit: z.number().int().min(1).max(50).optional(),
      period: z
        .enum(["latest", "annual_5y", "quarterly_8"])
        .describe("'latest' = current snapshot (TTM/most recent); annual_5y / quarterly_8 = history per ticker"),
      display: z
        .enum(["auto", "table", "line", "bar", "kpi"])
        .optional()
        .describe("Rendering hint; use 'auto' unless the user asks for a specific format"),
    }),
    execute: async (spec) => runMetricQuery(spec),
  }),
};

export type ChatUIMessage = InferChatUIMessageFromTools<typeof tools>;

export const tickerChat = chat.agent({
  id: "ticker-chat",
  tools,
  run: async ({ messages, tools, signal }) =>
    streamText({
      ...chat.toStreamTextOptions({ tools }),
      model: openrouter("anthropic/claude-sonnet-5"),
      system: SYSTEM,
      messages,
      abortSignal: signal,
      stopWhen: stepCountIs(6),
    }),
});
