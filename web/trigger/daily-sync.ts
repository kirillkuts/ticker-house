import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { schedules, logger } from "@trigger.dev/sdk";
import { detectEvents, lastBriefDate, PRICE_MOVE_THRESHOLD_PCT, type StockEvents } from "../lib/daily-events";

// Task 048: weekday-morning pipeline — refresh prices and filings, then
// detect per-watched-stock events for the briefing agent (049). The syncs
// run as the repo's npm scripts (owned by src/, cwd-relative paths and all),
// so this task must run where the repo and its databases are reachable: the
// `trigger.dev dev` machine in dev; a cloud deploy needs its own data access
// (see the 021 plan notes).

// The bundle runs from a build dir under web/.trigger; the repo root is
// wherever data/universe.txt lives, walking upward from cwd.
function repoRoot(): string {
  if (process.env.REPO_ROOT) return process.env.REPO_ROOT;
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "data", "universe.txt"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`repo root not found walking up from ${process.cwd()}; set REPO_ROOT`);
}

function runNpmScript(root: string, script: string, args: readonly string[] = []): Promise<{ code: number; tail: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", script, ...args], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    const lines: string[] = [];
    const keep = (chunk: Buffer) => {
      lines.push(...chunk.toString().split("\n"));
      if (lines.length > 60) lines.splice(0, lines.length - 60);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, tail: lines.join("\n").trim() }));
  });
}

export const dailySync = schedules.task({
  id: "daily-sync",
  // Weekday mornings ET, after the prior trading day is complete. Off the
  // :00 mark on purpose.
  cron: { pattern: "23 7 * * 1-5", timezone: "America/New_York" },
  maxDuration: 1800, // filings sync alone can take several minutes
  run: async () => {
    const root = repoRoot();

    // Explicit price range: the CLI default (yesterday only) syncs nothing
    // when yesterday was a weekend day, so Monday runs would never pick up
    // Friday's bar. Re-syncing already-present days is safe (ReplacingMergeTree).
    const day = (offset: number) => new Date(Date.now() - offset * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const priceArgs = ["--", "--from", day(6), "--to", day(1)];

    for (const [script, args] of [["sync:prices", priceArgs], ["sync:filings", []]] as const) {
      logger.info(`running ${script}`, { root, args });
      const { code, tail } = await runNpmScript(root, script, args);
      logger.info(`${script} finished`, { code, tail });
      // A sync failure isn't fatal for detection: stale data just means
      // fewer/older events, and the briefer's watermark catches up tomorrow.
      if (code !== 0) logger.error(`${script} exited ${code} — detecting on existing data`);
    }

    // Watermark: last briefed day (049's stock_briefs); before 049 exists,
    // yesterday.
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    const since = (await lastBriefDate()) ?? yesterday;

    const events = await detectEvents(since);
    for (const e of events) logger.info(describeStock(e), { symbol: e.symbol });
    const active = events.filter((e) => !e.quiet);
    logger.info(`event detection done`, {
      since,
      thresholdPct: PRICE_MOVE_THRESHOLD_PCT,
      watched: events.length,
      withEvents: active.length,
    });
    return { since, events };
  },
});

function describeStock(e: StockEvents): string {
  if (e.quiet) return `${e.symbol}: quiet`;
  const parts: string[] = [];
  for (const f of e.filings) parts.push(`${f.form} filed ${f.filedDate}${f.items ? ` (items ${f.items})` : ""}`);
  if (e.priceMove) {
    parts.push(
      `moved ${e.priceMove.movePct.toFixed(1)}% on ${e.priceMove.date} ($${e.priceMove.prevClose.toFixed(2)} -> $${e.priceMove.close.toFixed(2)})`,
    );
  }
  return `${e.symbol}: ${parts.join("; ")}`;
}
