import { db, ensureSchema } from "./db";
import { singleStockPrice, fundamentals, companyOverview, expenseBreakdown, segmentBreakdown, RANGES, type Range } from "./views";
import { runMetricQuery } from "./metric-query";

// The dashboard stores widget RECIPES (tool name + input), not frozen
// outputs: the page re-runs the view queries on every load, so saved widgets
// always show current data. Recipes live in Postgres, scoped to their owner.

export interface DashboardRecipe {
  widgetId: string;
  tool: string;
  input: Record<string, unknown>;
  addedAt: string;
}

export async function saveDashboardWidget(userId: string, widgetId: string, tool: string, inputJson: string): Promise<void> {
  await ensureSchema();
  await db().query(
    `INSERT INTO dashboard_widgets (widget_id, user_id, tool, input)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (widget_id) DO NOTHING`,
    [widgetId, userId, tool, inputJson],
  );
}

export async function removeDashboardWidget(userId: string, widgetId: string): Promise<void> {
  await ensureSchema();
  await db().query(`DELETE FROM dashboard_widgets WHERE widget_id = $1 AND user_id = $2`, [widgetId, userId]);
}

export async function listDashboardWidgets(userId: string): Promise<DashboardRecipe[]> {
  await ensureSchema();
  const res = await db().query<{ widgetId: string; tool: string; input: string; addedAt: string }>(
    `SELECT widget_id AS "widgetId", tool, input, to_char(added_at, 'YYYY-MM-DD HH24:MI:SS') AS "addedAt"
     FROM dashboard_widgets
     WHERE user_id = $1
     ORDER BY added_at`,
    [userId],
  );
  return res.rows.map((r) => ({ ...r, input: JSON.parse(r.input) as Record<string, unknown> }));
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
