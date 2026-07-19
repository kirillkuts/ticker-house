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

export interface Dashboard {
  id: string;
  name: string;
  createdAt: string;
  widgetCount: number;
}

export async function listDashboards(userId: string): Promise<Dashboard[]> {
  await ensureSchema();
  const res = await db().query<Dashboard>(
    `SELECT d.id, d.name, to_char(d.created_at, 'YYYY-MM-DD HH24:MI:SS') AS "createdAt",
            count(w.widget_id)::int AS "widgetCount"
     FROM dashboards d
     LEFT JOIN dashboard_widgets w ON w.dashboard_id = d.id
     WHERE d.user_id = $1
     GROUP BY d.id
     ORDER BY d.created_at`,
    [userId],
  );
  return res.rows;
}

export async function createDashboard(userId: string, name: string): Promise<{ id: string; name: string }> {
  await ensureSchema();
  const res = await db().query<{ id: string; name: string }>(
    `INSERT INTO dashboards (user_id, name) VALUES ($1, $2) RETURNING id, name`,
    [userId, name.trim().slice(0, 80) || "Untitled"],
  );
  return res.rows[0];
}

export async function renameDashboard(userId: string, id: string, name: string): Promise<void> {
  await ensureSchema();
  await db().query(`UPDATE dashboards SET name = $3 WHERE id = $1 AND user_id = $2`, [
    id, userId, name.trim().slice(0, 80) || "Untitled",
  ]);
}

// Widgets go with it (FK ON DELETE CASCADE).
export async function deleteDashboard(userId: string, id: string): Promise<void> {
  await ensureSchema();
  await db().query(`DELETE FROM dashboards WHERE id = $1 AND user_id = $2`, [id, userId]);
}

export async function saveDashboardWidget(
  userId: string,
  dashboardId: string,
  widgetId: string,
  tool: string,
  inputJson: string,
): Promise<void> {
  await ensureSchema();
  // The dashboard must belong to the same user; the subquery enforces it.
  await db().query(
    `INSERT INTO dashboard_widgets (widget_id, user_id, tool, input, dashboard_id)
     SELECT $1, $2, $3, $4, d.id FROM dashboards d WHERE d.id = $5 AND d.user_id = $2
     ON CONFLICT (widget_id) DO NOTHING`,
    [widgetId, userId, tool, inputJson, dashboardId],
  );
}

// Returns the removed recipe (null if nothing matched) so the caller can log
// the removal as an interest signal.
export async function removeDashboardWidget(userId: string, widgetId: string): Promise<{ tool: string; input: string } | null> {
  await ensureSchema();
  const res = await db().query<{ tool: string; input: string }>(
    `DELETE FROM dashboard_widgets WHERE widget_id = $1 AND user_id = $2 RETURNING tool, input`,
    [widgetId, userId],
  );
  return res.rows[0] ?? null;
}

export async function listDashboardWidgets(userId: string, dashboardId: string): Promise<DashboardRecipe[]> {
  await ensureSchema();
  const res = await db().query<{ widgetId: string; tool: string; input: string; addedAt: string }>(
    `SELECT widget_id AS "widgetId", tool, input, to_char(added_at, 'YYYY-MM-DD HH24:MI:SS') AS "addedAt"
     FROM dashboard_widgets
     WHERE user_id = $1 AND dashboard_id = $2
     ORDER BY added_at`,
    [userId, dashboardId],
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
