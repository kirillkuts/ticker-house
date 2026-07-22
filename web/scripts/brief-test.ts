/**
 * Manual test harness for the daily briefer, isolated from the cron wrapper
 * (trigger/daily-sync.ts) and the price/filing syncs. Drives lib/briefing.ts
 * against whatever is already in ClickHouse + Postgres.
 *
 * Run from web/ so web/node_modules (ai, @openrouter, pg, clickhouse) resolves:
 *   node --env-file=.env ../node_modules/.bin/tsx scripts/brief-test.ts --help
 *
 * Modes:
 *   --detect            free: seed watchlist, show what detectEvents finds. No LLM.
 *   --run               full: layer-1 briefs + layer-2 briefing. SPENDS OpenRouter credit.
 *
 * Options:
 *   --user <email>      whose watchlist/briefing (default: first non-@test.dev user)
 *   --watch A,B,C       (re)seed this user's active watchlist with these symbols
 *   --date YYYY-MM-DD   briefing date (default: today)
 *   --since YYYY-MM-DD  override the watermark, so older filings/moves count as events
 */
import { writeFile } from "node:fs/promises";
import { detectEvents, lastBriefDate } from "../lib/daily-events";
import { addToWatchlist, getWatchlist } from "../lib/watchlist";
import { runDailyBriefing, briefingForDate } from "../lib/briefing";
import { briefingHtml, sendBriefingEmail } from "../lib/email";
import { db } from "../lib/db";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function resolveUser(email?: string): Promise<{ id: string; email: string }> {
  if (email) {
    const r = await db().query<{ id: string; email: string }>(`SELECT id, email FROM users WHERE email = $1`, [email]);
    if (!r.rowCount) throw new Error(`no user ${email}`);
    return r.rows[0];
  }
  const r = await db().query<{ id: string; email: string }>(
    `SELECT id, email FROM users WHERE email NOT LIKE '%@test.dev' ORDER BY created_at LIMIT 1`,
  );
  if (!r.rowCount) throw new Error("no non-test user found; pass --user <email>");
  return r.rows[0];
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const date = arg("date") ?? today;
  const user = await resolveUser(arg("user"));
  console.log(`user: ${user.email} (${user.id})`);

  const watch = arg("watch");
  if (watch) {
    for (const s of watch.split(",").map((x) => x.trim()).filter(Boolean)) await addToWatchlist(user.id, s);
    console.log(`seeded watchlist: ${watch}`);
  }
  const wl = await getWatchlist(user.id);
  console.log(`active watchlist: ${wl.map((w) => w.symbol).join(", ") || "(empty)"}`);

  const since = arg("since") ?? (await lastBriefDate()) ?? "(yesterday)";
  console.log(`watermark 'since': ${since}   briefing date: ${date}\n`);

  if (has("detect")) {
    const events = await detectEvents(since === "(yesterday)" ? date : since);
    for (const e of events) {
      const bits = [
        ...e.filings.map((f) => `${f.form} ${f.filedDate}${f.items ? ` [items ${f.items}]` : ""}`),
        e.priceMove ? `move ${e.priceMove.movePct.toFixed(1)}% on ${e.priceMove.date}` : null,
      ].filter(Boolean);
      console.log(`  ${e.symbol.padEnd(6)} ${e.quiet ? "quiet" : "EVENTS"}  ${bits.join("; ")}`);
    }
    console.log(`\n${events.filter((e) => !e.quiet).length}/${events.length} watched stocks have events (no LLM called).`);
  }

  if (has("run")) {
    console.log("running full briefing (this spends OpenRouter credit)...\n");
    const report = await runDailyBriefing(date, { since: arg("since"), log: (m) => console.log("  " + m) });
    console.log("\nreport:", JSON.stringify(report, null, 2));
    const view = await briefingForDate(user.id, date);
    if (view) {
      console.log(`\n=== briefing for ${user.email} on ${date} ===\n${view.body}\n`);
      for (const s of view.sections) console.log(`--- ${s.symbol} (${s.status}) ---\n${s.body}\n`);
    }
  }

  // --html <path>: dump the rendered email HTML for preview (no send, no creds).
  const htmlPath = arg("html");
  if (htmlPath) {
    const view = await briefingForDate(user.id, date);
    if (!view) console.log("no briefing for that date to render");
    else { await writeFile(htmlPath, briefingHtml(view)); console.log(`wrote email HTML to ${htmlPath}`); }
  }

  // --email: actually send it (needs GMAIL_USER + GMAIL_APP_PASSWORD).
  if (has("email")) {
    const view = await briefingForDate(user.id, date);
    if (!view) console.log("no briefing for that date to email");
    else {
      const to = process.env.BRIEFING_TO || user.email;
      await sendBriefingEmail(to, view);
      console.log(`emailed briefing to ${to}`);
    }
  }

  await db().end();
}

main().catch((e) => { console.error(e); process.exit(1); });
