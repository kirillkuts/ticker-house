import { task, logger } from "@trigger.dev/sdk";
import { queryRows } from "../lib/clickhouse";
import { db } from "../lib/db";

// Connection preflight, visible in Trigger's Runs activity. Verifies the
// external services every task depends on — ClickHouse Cloud and the managed
// Postgres — over the same client paths the real tasks use, plus the presence
// of required secrets. Run it after a deploy or an env change to catch a broken
// connection (a wrong DATABASE_URL, a missing SSL flag, an unset key) before it
// surfaces as a failed briefing. The run goes RED if a hard dependency is down,
// and the logs say which.
export const healthcheck = task({
  id: "healthcheck",
  maxDuration: 60,
  run: async () => {
    const results: Record<string, string> = {};

    try {
      const rows = await queryRows<{ n: number }>("SELECT count() AS n FROM securities FINAL WHERE is_active");
      results.clickhouse = `ok (${rows[0]?.n ?? 0} active securities)`;
    } catch (e) {
      results.clickhouse = `FAIL: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`;
    }

    try {
      const r = await db().query<{ n: string }>("SELECT count(*)::text AS n FROM users");
      results.postgres = `ok (${r.rows[0]?.n ?? 0} users)`;
    } catch (e) {
      results.postgres = `FAIL: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`;
    }

    // Env presence only — never log values. OPENROUTER is required (chat +
    // briefing); GMAIL/APP_URL are optional (email off / links fall back).
    for (const key of ["OPENROUTER_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD", "APP_URL"]) {
      results[key] = process.env[key] ? "set" : "unset";
    }

    for (const [k, v] of Object.entries(results)) logger.info(`${k}: ${v}`, { check: k });

    const hardFail: string[] = [];
    if (results.clickhouse.startsWith("FAIL")) hardFail.push("clickhouse");
    if (results.postgres.startsWith("FAIL")) hardFail.push("postgres");
    if (!process.env.OPENROUTER_KEY) hardFail.push("OPENROUTER_KEY");
    if (hardFail.length) throw new Error(`healthcheck failed: ${hardFail.join(", ")}`);

    return results;
  },
});
