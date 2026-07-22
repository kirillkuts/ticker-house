import { generateText, generateObject } from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { db, ensureSchema } from "./db";
import { queryRows } from "./clickhouse";
import { verifyDataConnections } from "./preflight";
import { interestRanking } from "./watchlist";
import { detectEvents, lastBriefDate, type StockEvents } from "./daily-events";
import { recipeByKey } from "./recipes";
import { sendBriefingEmail, emailEnabled } from "./email";

// Task 049: two-layer daily briefing. Layer 1 writes ONE shared brief per
// (stock, day) — whoever watches it — grounded in filing text and price
// context, citing every filing it draws from. Layer 2 assembles a per-user
// briefing from those briefs, watchlist-first-then-interest ordered. Quiet
// days cost no LLM call at either layer and still write rows, because
// max(brief_date) is the event-detection watermark and must always advance.

// Haiku keeps the per-brief cost in tenths of a cent; briefs are short by
// design. Both calls cap output — OpenRouter rejects any request whose
// max-token ceiling exceeds the remaining credit (see the 044 commit).
const MODEL = "anthropic/claude-haiku-4.5";
const FILING_TEXT_CHARS = 12_000; // per filing, ~3k tokens
const MAX_FILINGS_PER_BRIEF = 3;

const openrouter = () => createOpenRouter({ apiKey: process.env.OPENROUTER_KEY });

// A pulled-out KPI for the metric-tile layout. value/delta are strings so the
// model reports exactly what the filing said ("$12.56B", "+13.4% YoY") without
// unit/rounding guesswork; direction drives the tile's up/down colour.
export interface BriefMetric {
  label: string;
  value: string;
  delta: string | null;
  direction: "up" | "down" | "flat" | "none";
}

const briefSchema = z.object({
  takeaway: z.string().describe("One plain-English sentence, <=110 chars: what happened and why it matters."),
  metrics: z
    .array(
      z.object({
        label: z.string().describe("Short metric name, e.g. 'Revenue', 'Diluted EPS', 'Net income', 'Op. cash flow'."),
        value: z.string().describe(
          "Human-readable magnitude with unit, exactly as a person would say it and as your takeaway/" +
          "narrative state it: '$12.56B', '$0.80', '~840,000'. Financial statements report in thousands " +
          "or millions — CONVERT and scale. NEVER copy a raw line value like '12,559,938'; that is $12.56B.",
        ),
        delta: z.string().nullable().describe("Change vs prior period if stated, human-scaled to match value, e.g. '+13.4% YoY' or 'vs $0.72'. Null if none."),
        direction: z.enum(["up", "down", "flat", "none"]).describe("Sign of the change for colour; 'none' if not a change."),
      }),
    )
    .describe("At most 4 headline figures drawn ONLY from the provided text. Empty if the text has no clear numbers."),
  highlights: z
    .array(z.string())
    .describe("2-3 short punchy bullet points (one line each, roughly <=90 chars) — the key facts and why it moved. No URLs, no citations, no filler."),
});

export interface BriefingReport {
  date: string;
  since: string;
  briefs: { symbol: string; status: "events" | "quiet"; cached: boolean }[];
  briefings: { userId: string; cached: boolean; quiet: boolean; deferred?: boolean }[];
  errors: string[];
}

export async function runDailyBriefing(
  date: string,
  opts: { since?: string; force?: boolean; onlyUserId?: string; log?: (msg: string) => void } = {},
): Promise<BriefingReport> {
  const log = opts.log ?? console.log;
  const force = opts.force ?? false;
  // Preflight: fail fast with a clear message if ClickHouse or Postgres is
  // unreachable, before spending any LLM calls on a run that can't finish.
  await verifyDataConnections(log);
  await ensureSchema();
  const yesterday = new Date(new Date(date).getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const since = opts.since ?? (await lastBriefDate()) ?? yesterday;
  const errors: string[] = [];

  const events = await detectEvents(since);
  log(`briefing ${date}: ${events.length} watched stocks, since ${since}`);

  const briefs: BriefingReport["briefs"] = [];
  for (const e of events) {
    try {
      briefs.push(await writeStockBrief(date, e, log));
    } catch (err) {
      errors.push(`${e.symbol}: ${err instanceof Error ? err.message.slice(0, 200) : err}`);
    }
  }

  const users = await db().query<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM watchlist WHERE removed_at IS NULL
     ${opts.onlyUserId ? "AND user_id = $1" : ""}`,
    opts.onlyUserId ? [opts.onlyUserId] : [],
  );
  const briefings: BriefingReport["briefings"] = [];
  for (const { user_id } of users.rows) {
    try {
      const result = await writeUserBriefing(user_id, date, log, force);
      briefings.push(result);
      // Email a freshly-written briefing (force regenerates, so it resends).
      if (!result.cached && !result.deferred && emailEnabled()) await emailBriefing(user_id, date, log, errors);
    } catch (err) {
      errors.push(`briefing for ${user_id}: ${err instanceof Error ? err.message.slice(0, 200) : err}`);
    }
  }

  return { date, since, briefs, briefings, errors };
}

// Send one user's briefing email. Recipient is BRIEFING_TO (single-box
// override) or the user's own address. Failures are collected, never thrown —
// a mail problem must not undo a written briefing.
async function emailBriefing(userId: string, date: string, log: (m: string) => void, errors: string[]): Promise<void> {
  try {
    const u = await db().query<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId]);
    const to = process.env.BRIEFING_TO || u.rows[0]?.email;
    if (!to) return;
    const view = await briefingForDate(userId, date);
    if (!view) return;
    await sendBriefingEmail(to, view);
    log(`emailed briefing for ${userId} to ${to}`);
  } catch (err) {
    errors.push(`email for ${userId}: ${err instanceof Error ? err.message.slice(0, 200) : err}`);
  }
}

// --- reads for the /briefing page (task 051) ----------------------------------

export interface BriefingStockSection {
  symbol: string;
  status: "events" | "quiet";
  takeaway: string;
  metrics: BriefMetric[];
  body: string;
  spark: number[];
  filings: { form: string; filedDate: string; url: string; items: string }[];
  priceMove: { date: string; movePct: number; close: number; prevClose: number } | null;
}

export interface BriefingView {
  date: string;
  body: string;
  sections: BriefingStockSection[];
}

export async function briefingDates(userId: string): Promise<string[]> {
  await ensureSchema();
  const res = await db().query<{ d: string }>(
    `SELECT to_char(briefing_date, 'YYYY-MM-DD') AS d FROM briefings
     WHERE user_id = $1 ORDER BY briefing_date DESC LIMIT 60`,
    [userId],
  );
  return res.rows.map((r) => r.d);
}

// The layer-2 body plus the underlying per-stock briefs for the user's
// watched symbols: the sections carry the reliable filing links (the
// assembled prose may abbreviate citations).
export async function briefingForDate(userId: string, date: string): Promise<BriefingView | null> {
  await ensureSchema();
  const briefing = await db().query<{ body: string }>(
    `SELECT body FROM briefings WHERE user_id = $1 AND briefing_date = $2`,
    [userId, date],
  );
  if (!briefing.rowCount) return null;

  const rows = await db().query<{ symbol: string; status: "events" | "quiet"; takeaway: string; metrics: unknown; body: string; events: unknown }>(
    `SELECT sb.symbol, sb.status, sb.takeaway, sb.metrics, sb.body, sb.events
     FROM stock_briefs sb
     WHERE sb.brief_date = $2
       AND sb.symbol IN (SELECT symbol FROM watchlist WHERE user_id = $1 AND removed_at IS NULL)
     ORDER BY (sb.status = 'events') DESC, sb.symbol`,
    [userId, date],
  );
  const sections = rows.rows.map((r) => {
    const ev = (r.events ?? {}) as { filings?: BriefingStockSection["filings"]; priceMove?: BriefingStockSection["priceMove"]; spark?: number[] };
    return {
      symbol: r.symbol,
      status: r.status,
      takeaway: r.takeaway ?? "",
      metrics: (r.metrics ?? []) as BriefMetric[],
      body: r.body,
      spark: ev.spark ?? [],
      filings: (ev.filings ?? []).map((f) => ({ form: f.form, filedDate: (f as { filedDate?: string; filed_date?: string }).filedDate ?? "", url: f.url, items: f.items ?? "" })),
      priceMove: ev.priceMove ?? null,
    };
  });
  return { date, body: briefing.rows[0].body, sections };
}

// --- layer 1 ------------------------------------------------------------------

async function writeStockBrief(
  date: string,
  e: StockEvents,
  log: (msg: string) => void,
): Promise<{ symbol: string; status: "events" | "quiet"; cached: boolean }> {
  const existing = await db().query(
    `SELECT 1 FROM stock_briefs WHERE symbol = $1 AND brief_date = $2`,
    [e.symbol, date],
  );
  // Idempotency = no duplicate LLM spend: one brief per (stock, day), ever.
  if (existing.rowCount) return { symbol: e.symbol, status: e.quiet ? "quiet" : "events", cached: true };

  let status: "events" | "quiet" = "quiet";
  let body = "No new filings and no notable price move.";
  let takeaway = "";
  let metrics: BriefMetric[] = [];

  if (!e.quiet) {
    status = "events";
    const context: string[] = [];

    if (e.priceMove) {
      context.push(
        `PRICE: closed $${e.priceMove.close.toFixed(2)} on ${e.priceMove.date}, ` +
          `${e.priceMove.movePct.toFixed(1)}% vs previous close $${e.priceMove.prevClose.toFixed(2)}.`,
      );
    }
    for (const f of e.filings.slice(0, MAX_FILINGS_PER_BRIEF)) {
      const rows = e.securityId !== null
        ? await queryRows<{ text: string }>(
            `SELECT text FROM filings FINAL WHERE security_id = {sid:UInt32} AND accession = {acc:String} LIMIT 1`,
            { sid: e.securityId, acc: f.accession },
          )
        : [];
      const text = rows[0]?.text?.slice(0, FILING_TEXT_CHARS) ?? "";
      context.push(
        `FILING: ${f.form} filed ${f.filedDate}${f.items ? ` (items ${f.items})` : ""}, URL ${f.url}\n${text || "(no document text available)"}`,
      );
    }

    const { object } = await generateObject({
      model: openrouter()(MODEL),
      maxOutputTokens: 900,
      schema: briefSchema,
      system:
        "You write the daily brief for one stock in TickerHouse. Ground yourself ONLY in the provided " +
        "filing text and price context — NEVER invent numbers or facts. Pull the headline figures the " +
        "filing actually states into `metrics` (report each value verbatim, e.g. '$12.56B'); leave " +
        "`metrics` empty if the text has no clear numbers. `takeaway` is one sentence on what happened " +
        "and why it matters. `highlights` are 2-3 punchy one-line bullets with the key supporting facts " +
        "— no URLs, no citations, no filler. No invented data.",
      prompt: `Stock: ${e.symbol}\nDate: ${date}\n\n${context.join("\n\n")}`,
    });
    takeaway = object.takeaway.trim();
    metrics = object.metrics.slice(0, 4);
    body = object.highlights.map((h) => `- ${h.trim()}`).filter((l) => l.length > 2).join("\n");
    log(`${e.symbol}: brief written (${metrics.length} metrics, ${object.highlights.length} bullets)`);
  }

  await db().query(
    `INSERT INTO stock_briefs (security_id, symbol, brief_date, status, events, body, takeaway, metrics)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (symbol, brief_date) DO NOTHING`,
    [e.securityId, e.symbol, date, status, JSON.stringify({ filings: e.filings, priceMove: e.priceMove, spark: e.spark }), body, takeaway, JSON.stringify(metrics)],
  );
  return { symbol: e.symbol, status, cached: false };
}

// --- layer 2 ------------------------------------------------------------------

async function writeUserBriefing(
  userId: string,
  date: string,
  log: (msg: string) => void,
  force = false,
): Promise<{ userId: string; cached: boolean; quiet: boolean; deferred?: boolean }> {
  // force (the "Run now" button) regenerates so a just-changed watchlist shows.
  if (!force) {
    const existing = await db().query(
      `SELECT 1 FROM briefings WHERE user_id = $1 AND briefing_date = $2`,
      [userId, date],
    );
    if (existing.rowCount) return { userId, cached: true, quiet: false };
  }

  // Watchlist-first-then-interest order, restricted to actually watched
  // symbols (interest alone doesn't put a stock in the briefing).
  const ranking = await interestRanking(userId);
  const watchedOrdered = ranking.filter((r) => r.watchlisted).map((r) => r.symbol);
  if (watchedOrdered.length === 0) return { userId, cached: true, quiet: true }; // nothing to brief

  const briefRows = await db().query<{ symbol: string; status: string; body: string; takeaway: string }>(
    `SELECT symbol, status, body, takeaway FROM stock_briefs WHERE brief_date = $1 AND symbol = ANY($2)`,
    [date, watchedOrdered],
  );
  const settings = await db().query<{ recipe_key: string | null; custom_instructions: string | null }>(
    `SELECT recipe_key, custom_instructions FROM users WHERE id = $1`,
    [userId],
  );
  const recipe = recipeByKey(settings.rows[0]?.recipe_key);
  const instructions = settings.rows[0]?.custom_instructions?.trim() || null;

  const briefOf = new Map(briefRows.rows.map((r) => [r.symbol, r]));
  // A watched symbol with NO brief row means layer 1 failed for it this run.
  // Writing the briefing anyway would falsely call the day quiet — and the
  // unique constraint would make that lie permanent. Defer; the next run
  // retries layer 1 first (its (symbol, date) row is still absent).
  const missing = watchedOrdered.filter((s) => !briefOf.has(s));
  if (missing.length > 0) {
    log(`briefing for ${userId} deferred: no brief yet for ${missing.join(", ")}`);
    return { userId, cached: false, quiet: false, deferred: true };
  }
  const active = watchedOrdered.filter((s) => briefOf.get(s)?.status === "events");
  const quietSymbols = watchedOrdered.filter((s) => briefOf.get(s)?.status !== "events");

  let body: string;
  if (active.length === 0) {
    // An honest one-liner, never padded analysis — and no LLM call.
    body = `Quiet day: no new filings and no notable moves across ${watchedOrdered.join(", ")}.`;
  } else {
    // The per-stock cards (tiles + narrative) carry the detail now, so layer 2
    // is a short synthesis across the watchlist — the takeaways, connected.
    const takeaways = active
      .map((s) => `- ${s}: ${briefOf.get(s)!.takeaway || briefOf.get(s)!.body}`)
      .join("\n");
    // Recipe and custom instructions shape emphasis only — the no-new-facts
    // rule stays in force and comes last so it wins.
    const persona = [
      recipe ? `READER PROFILE (recipe "${recipe.name}"):\n${recipe.template}` : "",
      instructions ? `THE USER'S OWN INSTRUCTIONS (extend/override the profile, presentation only):\n${instructions}` : "",
    ].filter(Boolean).join("\n\n");
    const { text } = await generateText({
      model: openrouter()(MODEL),
      maxOutputTokens: 300,
      system:
        "You write the overview at the top of a user's daily watchlist briefing as a short bulleted " +
        "list. The detailed per-stock cards appear below you, so DO NOT restate each stock — surface " +
        "the biggest movers and any shared theme.\n\n" +
        (persona ? `${persona}\n\n` : "") +
        "Above any profile or instruction: use only the facts given, never add numbers. Output 2-4 " +
        "markdown bullets ('- ' each, one line, roughly <=90 chars), most important first, then a final " +
        "bullet naming the quiet stocks. Bullets only — no heading, no intro sentence.",
      prompt: `Date: ${date}\n\nActive stock takeaways, priority order:\n${takeaways}\n\nQuiet stocks: ${quietSymbols.join(", ") || "none"}`,
    });
    body = text.trim();
  }

  await db().query(
    `INSERT INTO briefings (user_id, briefing_date, body) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, briefing_date) DO UPDATE SET body = EXCLUDED.body, created_at = now()`,
    [userId, date, body],
  );
  log(`briefing for ${userId}: ${active.length} active, ${quietSymbols.length} quiet`);
  return { userId, cached: false, quiet: active.length === 0 };
}
