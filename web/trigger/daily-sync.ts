import { schedules, logger } from "@trigger.dev/sdk";
import { detectEvents, lastBriefDate, PRICE_MOVE_THRESHOLD_PCT, type StockEvents } from "../lib/daily-events";
import { runDailyBriefing } from "../lib/briefing";

// Task 048/049: weekday-morning briefing. Data ingestion runs OUTSIDE the
// cloud — a local snapshot is pushed to prod ClickHouse (deploy/push-clickhouse.sh),
// so this task never syncs; it only reads. It detects per-watched-stock events
// since the last briefing, then writes layer-1 briefs and layer-2 per-user
// briefings. Quiet days write rows without LLM calls. Cloud-safe: only touches
// ClickHouse Cloud + managed Postgres — no repo, no filesystem, no subprocess.
//
// Note on a static snapshot: the watermark (max brief_date) advances each run,
// so after the first briefing the following days go quiet until the snapshot is
// refreshed. The in-app "Run briefing now" button re-anchors detection to the
// data's own latest date, so use it for demos on frozen data.

export const dailySync = schedules.task({
  id: "daily-sync",
  // Weekday mornings ET, after the prior trading day is complete. Off :00 on purpose.
  cron: { pattern: "23 7 * * 1-5", timezone: "America/New_York" },
  maxDuration: 900,
  run: async () => {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    const since = (await lastBriefDate()) ?? yesterday;

    // Per-stock event log for observability; the briefer re-detects internally
    // with the same watermark (detection is two cheap ClickHouse queries).
    for (const e of await detectEvents(since)) logger.info(describeStock(e), { symbol: e.symbol });

    const today = new Date().toISOString().slice(0, 10);
    const report = await runDailyBriefing(today, { since, log: (m) => logger.info(m) });
    logger.info("daily briefing done", {
      since: report.since,
      thresholdPct: PRICE_MOVE_THRESHOLD_PCT,
      briefs: report.briefs.length,
      briefings: report.briefings.length,
      errors: report.errors,
    });
    return report;
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
