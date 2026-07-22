import { queryRows } from "./clickhouse";
import { db } from "./db";

const msg = (e: unknown) => (e instanceof Error ? e.message.slice(0, 200) : String(e));

// Fail fast with one clear message if a data connection is down, before the
// briefing spends any LLM calls. Both databases are probed so a single error
// names everything that's broken (a wrong DATABASE_URL, a missing SSL flag, an
// unreachable ClickHouse) instead of surfacing cryptically deep in the run.
// Shared by runDailyBriefing (preflight step) and the healthcheck task.
export async function verifyDataConnections(log: (m: string) => void = () => {}): Promise<void> {
  const problems: string[] = [];

  try {
    await queryRows("SELECT 1 AS ok");
    log("preflight: clickhouse ok");
  } catch (e) {
    problems.push(`clickhouse (${msg(e)})`);
  }

  try {
    await db().query("SELECT 1");
    log("preflight: postgres ok");
  } catch (e) {
    problems.push(`postgres (${msg(e)})`);
  }

  if (problems.length) throw new Error(`preflight failed: ${problems.join("; ")}`);
}
