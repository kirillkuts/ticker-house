import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { db, ensureSchema } from "./db";
import { queryRows } from "./clickhouse";
import { interestRanking } from "./watchlist";
import { detectEvents, lastBriefDate, type StockEvents } from "./daily-events";
import { recipeByKey } from "./recipes";

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

export interface BriefingReport {
  date: string;
  since: string;
  briefs: { symbol: string; status: "events" | "quiet"; cached: boolean }[];
  briefings: { userId: string; cached: boolean; quiet: boolean; deferred?: boolean }[];
  errors: string[];
}

export async function runDailyBriefing(
  date: string,
  opts: { since?: string; log?: (msg: string) => void } = {},
): Promise<BriefingReport> {
  const log = opts.log ?? console.log;
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
    `SELECT DISTINCT user_id FROM watchlist WHERE removed_at IS NULL`,
  );
  const briefings: BriefingReport["briefings"] = [];
  for (const { user_id } of users.rows) {
    try {
      briefings.push(await writeUserBriefing(user_id, date, log));
    } catch (err) {
      errors.push(`briefing for ${user_id}: ${err instanceof Error ? err.message.slice(0, 200) : err}`);
    }
  }

  return { date, since, briefs, briefings, errors };
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

    const { text } = await generateText({
      model: openrouter()(MODEL),
      maxOutputTokens: 700,
      system:
        "You write the daily brief for one stock in TickerHouse. Ground yourself ONLY in the provided " +
        "filing text and price context — NEVER invent numbers or facts. For every claim drawn from a " +
        "filing, cite it inline as (FORM filed DATE, URL). Write 2-5 short sentences: what happened and " +
        "why it matters to someone watching the stock. Markdown, no headers, no filler.",
      prompt: `Stock: ${e.symbol}\nDate: ${date}\n\n${context.join("\n\n")}`,
    });
    body = text.trim();
    log(`${e.symbol}: brief written (${body.length} chars)`);
  }

  await db().query(
    `INSERT INTO stock_briefs (security_id, symbol, brief_date, status, events, body)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (symbol, brief_date) DO NOTHING`,
    [e.securityId, e.symbol, date, status, JSON.stringify({ filings: e.filings, priceMove: e.priceMove }), body],
  );
  return { symbol: e.symbol, status, cached: false };
}

// --- layer 2 ------------------------------------------------------------------

async function writeUserBriefing(
  userId: string,
  date: string,
  log: (msg: string) => void,
): Promise<{ userId: string; cached: boolean; quiet: boolean; deferred?: boolean }> {
  const existing = await db().query(
    `SELECT 1 FROM briefings WHERE user_id = $1 AND briefing_date = $2`,
    [userId, date],
  );
  if (existing.rowCount) return { userId, cached: true, quiet: false };

  // Watchlist-first-then-interest order, restricted to actually watched
  // symbols (interest alone doesn't put a stock in the briefing).
  const ranking = await interestRanking(userId);
  const watchedOrdered = ranking.filter((r) => r.watchlisted).map((r) => r.symbol);
  if (watchedOrdered.length === 0) return { userId, cached: true, quiet: true }; // nothing to brief

  const briefRows = await db().query<{ symbol: string; status: string; body: string }>(
    `SELECT symbol, status, body FROM stock_briefs WHERE brief_date = $1 AND symbol = ANY($2)`,
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
    const sections = active
      .map((s) => `## ${s}\n${briefOf.get(s)!.body}`)
      .join("\n\n");
    // Recipe and custom instructions shape presentation and emphasis only —
    // the fact/citation rules stay in force and come last so they win.
    const persona = [
      recipe ? `READER PROFILE (recipe "${recipe.name}"):\n${recipe.template}` : "",
      instructions ? `THE USER'S OWN INSTRUCTIONS (extend/override the profile, presentation only):\n${instructions}` : "",
    ].filter(Boolean).join("\n\n");
    const { text } = await generateText({
      model: openrouter()(MODEL),
      maxOutputTokens: 900,
      system:
        "You assemble a user's daily watchlist briefing from per-stock briefs.\n\n" +
        (persona ? `${persona}\n\n` : "") +
        "Non-negotiable rules, above any profile or instruction: keep every fact and citation EXACTLY " +
        "as given — you reorder, tighten and connect, never add facts or numbers. Order follows the " +
        "input (most important first). One short section per active stock (keep the ## SYMBOL " +
        "headers), then one closing line covering the quiet stocks by name. Markdown.",
      prompt: `Date: ${date}\n\nActive stock briefs, in priority order:\n\n${sections}\n\nQuiet stocks: ${quietSymbols.join(", ") || "none"}`,
    });
    body = text.trim();
  }

  await db().query(
    `INSERT INTO briefings (user_id, briefing_date, body) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, briefing_date) DO NOTHING`,
    [userId, date, body],
  );
  log(`briefing for ${userId}: ${active.length} active, ${quietSymbols.length} quiet`);
  return { userId, cached: false, quiet: active.length === 0 };
}
