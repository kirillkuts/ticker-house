import { db, ensureSchema } from "./db";
import { queryRows } from "./clickhouse";

// Explicit watchlist membership plus implicit interest events, both keyed by
// symbol (uppercase, as typed). Weights are stamped into each event row at
// insert time so re-tuning them later doesn't rewrite history.

export const INTEREST_WEIGHTS = {
  chat_question: 3,
  explain_click: 2,
  view_rendered: 1,
  overview_view: 1,
  widget_saved: 3,
  widget_removed: -3,
  watchlist_add: 5,
  watchlist_remove: -5,
} as const;

export type InterestKind = keyof typeof INTEREST_WEIGHTS;

export interface WatchlistEntry {
  symbol: string;
  securityId: number | null;
  addedAt: string;
}

export interface InterestRank {
  symbol: string;
  score: number;
  watchlisted: boolean;
}

// Best-effort security_id lookup. Resolution can be wrong for exotic tickers
// (symbol history: the FB row isn't Meta), so the briefer re-resolves later;
// a miss or a ClickHouse outage must never block the write.
async function resolveSecurityId(symbol: string): Promise<number | null> {
  try {
    const rows = await queryRows<{ security_id: number }>(
      `SELECT security_id FROM securities FINAL
       WHERE is_active AND upper(ticker) = {symbol:String}
       LIMIT 1`,
      { symbol },
    );
    return rows[0]?.security_id ?? null;
  } catch {
    return null;
  }
}

export async function addToWatchlist(userId: string, symbol: string): Promise<void> {
  await ensureSchema();
  const sym = symbol.trim().toUpperCase();
  const securityId = await resolveSecurityId(sym);
  // The partial unique index only covers active rows, so a re-add after a
  // soft remove inserts a fresh row; adding twice is a no-op.
  const res = await db().query(
    `INSERT INTO watchlist (user_id, symbol, security_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, symbol) WHERE removed_at IS NULL DO NOTHING`,
    [userId, sym, securityId],
  );
  if (res.rowCount) await recordInterest(userId, sym, "watchlist_add");
}

export async function removeFromWatchlist(userId: string, symbol: string): Promise<void> {
  await ensureSchema();
  const sym = symbol.trim().toUpperCase();
  const res = await db().query(
    `UPDATE watchlist SET removed_at = now()
     WHERE user_id = $1 AND symbol = $2 AND removed_at IS NULL`,
    [userId, sym],
  );
  if (res.rowCount) await recordInterest(userId, sym, "watchlist_remove");
}

export async function getWatchlist(userId: string): Promise<WatchlistEntry[]> {
  await ensureSchema();
  const res = await db().query<WatchlistEntry>(
    `SELECT symbol, security_id AS "securityId",
            to_char(added_at, 'YYYY-MM-DD HH24:MI:SS') AS "addedAt"
     FROM watchlist
     WHERE user_id = $1 AND removed_at IS NULL
     ORDER BY added_at DESC`,
    [userId],
  );
  return res.rows;
}

// Fire-and-forget: interest logging must never break a chat turn or a page
// render, so every failure is swallowed after a console line.
export async function recordInterest(
  userId: string,
  symbol: string,
  kind: InterestKind,
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    await ensureSchema();
    await db().query(
      `INSERT INTO stock_interest_events (user_id, symbol, kind, weight, context)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, symbol.trim().toUpperCase(), kind, INTEREST_WEIGHTS[kind], context ?? null],
    );
  } catch (e) {
    console.error(`recordInterest(${kind}, ${symbol}) failed:`, e);
  }
}

// One query: weight × exponential recency decay (half-life ~7 days) summed
// per symbol over the window, with watchlisted symbols pinned to the top
// regardless of score. This is the function the briefer calls.
export async function interestRanking(
  userId: string,
  { days = 30 }: { days?: number } = {},
): Promise<InterestRank[]> {
  await ensureSchema();
  const res = await db().query<InterestRank>(
    `WITH scores AS (
       SELECT symbol,
              sum(weight * exp(-ln(2) * extract(epoch FROM now() - created_at) / (7 * 86400)))::float8 AS score
       FROM stock_interest_events
       WHERE user_id = $1 AND created_at > now() - make_interval(days => $2)
       GROUP BY symbol
     ),
     watch AS (
       SELECT symbol FROM watchlist WHERE user_id = $1 AND removed_at IS NULL
     )
     SELECT coalesce(s.symbol, w.symbol) AS symbol,
            coalesce(s.score, 0) AS score,
            (w.symbol IS NOT NULL) AS watchlisted
     FROM scores s
     FULL OUTER JOIN watch w ON w.symbol = s.symbol
     ORDER BY (w.symbol IS NOT NULL) DESC, coalesce(s.score, 0) DESC, 1`,
    [userId, days],
  );
  return res.rows;
}
