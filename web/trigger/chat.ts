import { chat } from "@trigger.dev/sdk/ai";
import { streamText, stepCountIs, tool } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import type { InferChatUIMessageFromTools } from "@trigger.dev/sdk/ai";
import { singleStockPrice, fundamentals, companyOverview, expenseBreakdown, segmentBreakdown, RANGES } from "../lib/views";
import { METRICS, METRIC_KEYS } from "../lib/metric-registry";
import { runMetricQuery } from "../lib/metric-query";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_KEY });

const SYSTEM = `You are TickerHouse, a stock research assistant.

Answer questions about stocks by rendering predefined dashboard views via
tools. NEVER invent numbers; the tools return the real data and the UI
renders it. After a tool call, write ONE short paragraph of takeaways based
strictly on the tool result — no restating every number.

Metric views explain themselves: every metric label in a rendered view has
a hover tooltip with a plain-language definition. So when the user asks to
explain metrics or scores ("explain each metric", "in plain language for a
non-expert"), still call the view tool, but do NOT write a definition
paragraph per metric — keep to ONE short paragraph with the comparative
takeaways (who leads, what stands out) and mention that hovering a metric
name shows what it means.

Coverage: price charts work for nearly ALL US tickers, but only for
2026-07-01..2026-07-16 (use range "7d" or "1m"). Fundamentals, metrics and
the company overview (back to ~2008) exist only for: AAPL MSFT NVDA META
BRK-B GOOGL AMZN TSLA JPM LLY. When asked about a stock outside that list,
say fundamentals aren't covered AND offer/show its price chart — do not
claim you have no price data. Only refuse outright when even a price chart
can't work.

Tool choice: for broad single-stock questions ("tell me about X", "overview
of X", "how is X doing overall", "is X a good company"), use
show_company_overview — it is the richest view (price, valuation vs peers,
scores, growth, margins, health). Use query_metrics for ratios, screens,
rankings, and multi-stock comparisons ("which stocks...", "compare X and Y",
"rank by..."). Use show_price_chart / show_fundamentals when the question is
narrowly about price action or statement history. P/E and other "latest"
metrics are TTM-based; some metrics can be NULL for a stock (missing source
data), and filters exclude NULL rows.

Spending & segments: for "where does X spend its money", "what are X's
expenses / costs made of", "why is the margin 40%", use
show_expense_breakdown — it decomposes revenue into cost of revenue, R&D,
sales & marketing, G&A and operating income. Some companies (NVDA, TSLA,
LLY) only report a combined SG&A line, and banks/insurers (JPM, BRK-B) have
no standard expense lines at all — the tool says so; fall back to
show_fundamentals there. For "revenue by segment / division / region",
"how big is AWS / Reality Labs", use show_segments — segment names are
as-reported by each company and only annual data is shown. JPM has no
segment revenue loaded. Some companies' reportable segments are
geographic (AAPL: Americas, Europe…); the result then also carries a
"products" split (iPhone, Mac, Services…) — never claim such a company
"doesn't break out product lines"; ground your text in whichever axis
answers the question.

View-first rule: if a question CAN be answered with a view tool, you MUST
call one — never put numbers in plain text that a view could render.
Judgment questions ("is X a good company", "is the price justified",
"what's behind the scores") are metric comparisons: call query_metrics or
show_company_overview first, then give a one-paragraph verdict grounded in
the rendered view. Plain-text-only answers are reserved for coverage/meta
questions ("what do you cover?") where no view applies.

The [canvas] block never satisfies this rule. A similar view already
pinned on the canvas is NOT a reason to answer in text: answering "where
does X spend its money" with a bullet list "based on the expense breakdown
already on your canvas" is wrong — call the view tool again in THIS answer
and keep your text to one short takeaway paragraph. The only exception is
an explicit explain request that names a canvas view and says not to
re-render it ("what is this view showing?") — answer that in plain
language with no tool call.

Fact anchors: whenever you rendered show_fundamentals and your takeaway
text cites specific values or changes ("revenue tripled from $137B
(FY2018) to $403B (FY2025)"), ALSO call highlight_facts — after your
text, before suggest_follow_ups — mapping each such claim to its
cell(s). Copy row labels exactly ('FY2025' / 'Sep 2025'); columns are
revenue, net_income, eps, fcf, net_margin. A change claim gets one fact
per endpoint with the same short snippet. The table then carries your
explanation as hoverable dots, so keep the prose itself short.

Follow-ups: after your text answer is complete, ALWAYS call
suggest_follow_ups exactly once with 2-3 short, concrete next questions the
user would plausibly ask, each answerable with the available views and
covered tickers. Labels under 32 characters; prompts are full questions.
Never suggest anything outside coverage. It must be the LAST thing in your
response: write no text after it — no "let me know", no closing line; the
buttons are the closing line.

Canvas: the UI has a side panel ("canvas") where views are pinned. If the
user message ends with a [canvas] block, that is its current content — never
read it aloud, but use it to answer questions about the canvas and to edit
it with the edit_canvas tool ("remove the price chart", "clear the canvas",
"add this to the canvas"). To put NEW views on the canvas, first call the
view tools, then edit_canvas with add_new_views: true.

When a canvas exists and the user says "add ..." or "show ... too", they
want a new view pinned next to the others: pick the best view tool for it,
call it, then edit_canvas with add_new_views: true. Do this even if an
existing view partly overlaps the data; never refuse with "it's already
there". Only skip the tool call when NO view can show the requested data.

If no view fits the question, answer in plain text.`;

export const tools = {
  show_company_overview: tool({
    description:
      "Render the full company dashboard for one stock: price, market cap, valuation vs peers (P/E, P/S), 0-5 scores (value, growth, profitability, health, cash flow), annual revenue/income history, margin trends, and balance-sheet health. Use for broad single-stock questions: 'tell me about X', 'overview of X', 'is X a good company?'. Only works for the covered fundamentals universe.",
    inputSchema: z.object({
      ticker: z.string().describe("Stock ticker, e.g. NVDA"),
    }),
    execute: async ({ ticker }) => companyOverview(ticker),
  }),
  show_price_chart: tool({
    description:
      "Render a price dashboard for one stock: OHLC chart, volume, and KPI tiles. Use for any question about a stock's price, performance, or recent movement. Works for nearly all US tickers, not just the fundamentals universe.",
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
  show_expense_breakdown: tool({
    description:
      "Render an expense-composition dashboard for one stock: stacked revenue decomposition (cost of revenue, R&D, sales & marketing, G&A, other, operating income), operating-margin trend, and a latest-period table with % of revenue. Use for 'where does X spend its money', 'what are X's expenses made of', 'what's behind the margin'. Only for the covered fundamentals universe; financial-sector names may not have standard expense lines.",
    inputSchema: z.object({
      ticker: z.string().describe("Stock ticker, e.g. META"),
      periodType: z.enum(["quarter", "annual"]).describe("Quarterly or annual; default annual for composition questions"),
    }),
    execute: async ({ ticker, periodType }) => expenseBreakdown(ticker, periodType),
  }),
  show_segments: tool({
    description:
      "Render a segment dashboard for one stock: annual revenue by business segment (stacked), operating income by segment, and revenue by geography. Segment names are as-reported (e.g. Meta's Family of Apps vs Reality Labs, Amazon's AWS). Use for 'revenue by segment/division/region', 'how big is AWS', 'is Reality Labs losing money'. Only for the covered fundamentals universe.",
    inputSchema: z.object({
      ticker: z.string().describe("Stock ticker, e.g. META"),
    }),
    execute: async ({ ticker }) => segmentBreakdown(ticker),
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
  highlight_facts: tool({
    description:
      "Anchor your explanation to the fundamentals table it cites. After show_fundamentals AND after your takeaway text (but before suggest_follow_ups), call this once, mapping each concrete claim to the cell(s) it references. The widget shows a pulsing dot beside each referenced value; hovering reveals your sentence — so the user scans the table instead of re-reading prose. period must copy a row label exactly as the view shows it ('FY2025', 'Sep 2025'). For a change between two periods ('revenue tripled from $137B to $403B'), emit one fact per endpoint with the same snippet. The client applies this; it only records the mapping.",
    inputSchema: z.object({
      ticker: z.string().describe("Ticker of the fundamentals view these facts belong to"),
      facts: z
        .array(z.object({
          period: z.string().describe("Row label exactly as shown, e.g. 'FY2025' or 'Sep 2025'"),
          column: z.enum(["revenue", "net_income", "eps", "fcf", "net_margin"]),
          snippet: z.string().max(200).describe("The one sentence of your explanation this cell supports"),
        }))
        .min(1)
        .max(12),
    }),
    execute: async (input) => ({ applied: true, count: input.facts.length }),
  }),
  suggest_follow_ups: tool({
    description:
      "Offer the user 2-3 clickable follow-up questions, shown as buttons under your answer. Call this exactly once at the END of every response, after any view tools and after your text. Each prompt MUST be phrased so answering it calls a view tool — name concrete metrics, charts or dashboards ('Compare net margins for MSFT vs GOOGL', 'Chart AAPL's EPS over 5 years'), never an open discussion question ('Is it a good company?' without naming metrics). Each prompt must also respect coverage: only the covered tickers (AAPL MSFT NVDA META BRK-B GOOGL AMZN TSLA JPM LLY), price questions only about the two covered weeks (never '1-year price'), metrics/fundamentals back to ~2008.",
    inputSchema: z.object({
      suggestions: z
        .array(z.object({
          label: z.string().max(40).describe("Short button label, e.g. 'Compare with MSFT'"),
          prompt: z.string().describe("The full question to send when clicked"),
        }))
        .min(2)
        .max(4),
    }),
    execute: async (s) => s,
  }),
  edit_canvas: tool({
    description:
      "Edit the user's canvas — the dashboard panel beside the chat that holds pinned views. The current canvas contents, when any, are listed at the end of the user message in a [canvas] block as 'id — description' lines. Use remove/clear to drop views the user no longer wants, and add_new_views:true to pin the views you created earlier in THIS response onto the canvas (call it AFTER the view tools). The client applies the change; this tool only records the instruction.",
    inputSchema: z.object({
      remove: z.array(z.string()).optional().describe("View ids (from the [canvas] block) to remove"),
      clear: z.boolean().optional().describe("Remove everything from the canvas first"),
      add_new_views: z.boolean().optional().describe("Add all views created in this response to the canvas"),
    }),
    execute: async (op) => ({ applied: true, ...op }),
  }),
};

export type ChatUIMessage = InferChatUIMessageFromTools<typeof tools>;

// Per-turn model choice: pre-prompted chip clicks arrive with
// { speed: "fast" } metadata (they're phrased to map straight onto view
// tools, so a small model suffices); typed questions get the default model.
// Unknown or missing metadata falls back to the default.
const MODELS = {
  fast: "anthropic/claude-haiku-4.5",
  default: "anthropic/claude-sonnet-5",
} as const;

const clientDataSchema = z
  .object({ speed: z.enum(["fast", "default"]).optional() })
  .optional();

export const tickerChat = chat.agent({
  id: "ticker-chat",
  tools,
  clientDataSchema,
  run: async ({ messages, tools, signal, clientData }) =>
    streamText({
      ...chat.toStreamTextOptions({ tools }),
      model: openrouter(MODELS[clientData?.speed ?? "default"]),
      system: SYSTEM,
      messages,
      abortSignal: signal,
      stopWhen: stepCountIs(7),
    }),
});
