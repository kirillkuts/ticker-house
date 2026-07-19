import { chClient } from "./clickhouse";
import { singleStockPrice, fundamentals, companyOverview, expenseBreakdown, segmentBreakdown, RANGES, type Range } from "./views";
import { runMetricQuery } from "./metric-query";

// The dashboard stores widget RECIPES (tool name + input), not frozen
// outputs: the page re-runs the view queries on every load, so saved widgets
// always show current data.

export interface DashboardRecipe {
  widgetId: string;
  tool: string;
  input: Record<string, unknown>;
  addedAt: string;
}

let ensured: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  ensured ??= (async () => {
    const ch = chClient();
    try {
      await ch.command({
        query: `
CREATE TABLE IF NOT EXISTS dashboard_widgets
(
    widget_id String,
    tool String,
    input String,
    added_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(added_at)
ORDER BY widget_id`,
      });
    } finally {
      await ch.close();
    }
  })();
  return ensured;
}

export async function saveDashboardWidget(widgetId: string, tool: string, inputJson: string): Promise<void> {
  await ensureTable();
  const ch = chClient();
  try {
    await ch.insert({
      table: "dashboard_widgets",
      values: [{ widget_id: widgetId, tool, input: inputJson }],
      format: "JSONEachRow",
    });
  } finally {
    await ch.close();
  }
}

export async function removeDashboardWidget(widgetId: string): Promise<void> {
  await ensureTable();
  const ch = chClient();
  try {
    await ch.command({
      query: `DELETE FROM dashboard_widgets WHERE widget_id = {id:String}`,
      query_params: { id: widgetId },
    });
  } finally {
    await ch.close();
  }
}

export async function listDashboardWidgets(): Promise<DashboardRecipe[]> {
  await ensureTable();
  const ch = chClient();
  try {
    const rs = await ch.query({
      query: `SELECT widget_id AS widgetId, tool, input, toString(added_at) AS addedAt
              FROM dashboard_widgets FINAL
              ORDER BY added_at`,
      query_params: {},
      format: "JSONEachRow",
    });
    const rows = await rs.json<{ widgetId: string; tool: string; input: string; addedAt: string }>();
    return rows.map((r) => ({ ...r, input: JSON.parse(r.input) as Record<string, unknown> }));
  } finally {
    await ch.close();
  }
}

// Re-run a recipe against live data. Unknown tools and query failures return
// { error } so one broken widget can't take down the page.
export async function runDashboardRecipe(recipe: DashboardRecipe): Promise<unknown> {
  const input = recipe.input;
  try {
    switch (recipe.tool) {
      case "show_company_overview":
        return await companyOverview(String(input.ticker));
      case "show_price_chart": {
        const range = String(input.range) in RANGES ? (String(input.range) as Range) : "1m";
        return await singleStockPrice(String(input.ticker), range);
      }
      case "show_fundamentals":
        return await fundamentals(String(input.ticker), input.periodType === "quarter" ? "quarter" : "annual");
      case "show_expense_breakdown":
        return await expenseBreakdown(String(input.ticker), input.periodType === "quarter" ? "quarter" : "annual");
      case "show_segments":
        return await segmentBreakdown(String(input.ticker));
      case "query_metrics":
        return await runMetricQuery(input as unknown as Parameters<typeof runMetricQuery>[0]);
      default:
        return { error: `Unknown widget tool: ${recipe.tool}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Widget failed to load" };
  }
}
