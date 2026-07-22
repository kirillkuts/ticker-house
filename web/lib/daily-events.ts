import { db, ensureSchema } from "./db";
import { queryRows } from "./clickhouse";

// Daily event detection (task 048): per stock on any user's watchlist, what
// happened since the last briefing — new filings and/or a notable daily price
// move. Output feeds the briefing agent (049) directly; no events table.

// |close-to-close| daily move worth a briefing. Maybe volume-aware later.
export const PRICE_MOVE_THRESHOLD_PCT = 3;

export interface FilingEvent {
  accession: string;
  form: string;
  filedDate: string;
  items: string;
  url: string;
}

export interface PriceMoveEvent {
  date: string;
  prevClose: number;
  close: number;
  movePct: number; // signed
}

export interface StockEvents {
  symbol: string;
  securityId: number | null; // null: watched symbol with no active security
  filings: FilingEvent[];
  priceMove: PriceMoveEvent | null;
  spark: number[]; // recent closes, oldest -> newest, for the sparkline
  quiet: boolean;
}

// Every symbol actively watched by anyone — layer 1 of the briefer is shared
// per stock, so detection is user-agnostic.
export async function watchedSymbolsAllUsers(): Promise<string[]> {
  await ensureSchema();
  const res = await db().query<{ symbol: string }>(
    `SELECT DISTINCT symbol FROM watchlist WHERE removed_at IS NULL ORDER BY symbol`,
  );
  return res.rows.map((r) => r.symbol);
}

// The watermark: last briefed day, so a skipped run catches up on the next.
// Until 049 lands there are no stock_briefs rows and this returns null; the
// caller falls back to "since yesterday".
export async function lastBriefDate(): Promise<string | null> {
  try {
    const res = await db().query<{ d: string | null }>(
      `SELECT to_char(max(brief_date), 'YYYY-MM-DD') AS d FROM stock_briefs`,
    );
    return res.rows[0]?.d ?? null;
  } catch {
    return null; // table doesn't exist yet (pre-049)
  }
}

// Newest day present in the data (filings or prices). The force-run anchors
// its detection window here, not to the wall clock: the synced data can be
// days or weeks behind "today", and a demo still needs events to surface.
export async function latestDataDate(): Promise<string | null> {
  try {
    const rows = await queryRows<{ d: string }>(
      `SELECT toString(max(m)) AS d FROM (
         SELECT max(filed_date) AS m FROM filings
         UNION ALL SELECT max(trade_date) FROM daily_prices FINAL
       ) WHERE m > '1970-01-01'`,
    );
    return rows[0]?.d || null;
  } catch {
    return null;
  }
}

export async function detectEvents(
  since: string,
  thresholdPct: number = PRICE_MOVE_THRESHOLD_PCT,
): Promise<StockEvents[]> {
  const symbols = await watchedSymbolsAllUsers();
  if (symbols.length === 0) return [];

  const secs = await queryRows<{ security_id: number; ticker: string }>(
    `SELECT security_id, upper(ticker) AS ticker FROM securities FINAL
     WHERE is_active AND upper(ticker) IN ({symbols:Array(String)})`,
    { symbols },
  );
  const idOf = new Map(secs.map((s) => [s.ticker, s.security_id]));
  const ids = secs.map((s) => s.security_id);

  const [filingRows, priceRows] = await Promise.all([
    // v1 forms only (10-K / 10-Q / 8-K, amendments included): Form 4 and 144
    // insider filings are frequent noise the briefer shouldn't wake up for.
    queryRows<{ security_id: number; accession: string; form: string; filedDate: string; items: string; url: string }>(
      `SELECT security_id, accession, form, toString(filed_date) AS filedDate, items, url
       FROM filings FINAL
       WHERE security_id IN ({ids:Array(UInt32)}) AND filed_date > {since:Date}
         AND match(form, '^(10-K|10-Q|8-K)(/A)?$')
       ORDER BY filed_date, accession`,
      { ids, since },
    ),
    // Two latest closes per security, own-symbol rows only (the FB/Meta
    // symbol-reuse trap: rows under a reused source symbol aren't this
    // company; sibling share classes are excluded too, which is fine here).
    queryRows<{ security_id: number; date: string; close: number }>(
      `SELECT security_id, toString(trade_date) AS date, toFloat64(close) AS close
       FROM (
         SELECT p.security_id, p.trade_date, p.close,
                row_number() OVER (PARTITION BY p.security_id ORDER BY p.trade_date DESC) AS rn
         FROM daily_prices AS p FINAL
         INNER JOIN securities AS s FINAL ON s.security_id = p.security_id AND s.is_active
         WHERE p.security_id IN ({ids:Array(UInt32)})
           AND replaceAll(p.source_symbol, '.', '-') = upper(s.ticker)
       )
       WHERE rn <= 40
       ORDER BY security_id, date`,
      { ids },
    ),
  ]);

  const filingsBySec = new Map<number, FilingEvent[]>();
  for (const f of filingRows) {
    const list = filingsBySec.get(f.security_id) ?? [];
    list.push({ accession: f.accession, form: f.form, filedDate: f.filedDate, items: f.items, url: f.url });
    filingsBySec.set(f.security_id, list);
  }

  const closesBySec = new Map<number, { date: string; close: number }[]>();
  for (const p of priceRows) {
    const list = closesBySec.get(p.security_id) ?? [];
    list.push({ date: p.date, close: p.close });
    closesBySec.set(p.security_id, list);
  }

  return symbols.map((symbol) => {
    const securityId = idOf.get(symbol.toUpperCase()) ?? null;
    const filings = securityId !== null ? (filingsBySec.get(securityId) ?? []) : [];
    let priceMove: PriceMoveEvent | null = null;
    const closes = securityId !== null ? (closesBySec.get(securityId) ?? []) : [];
    // A stale latest bar (before `since`) is old news, not an event. The
    // comparison is >= because a brief written on morning D covers through
    // D-1's close: day D's own close belongs to the NEXT brief, so with the
    // watermark at D the bar dated D must still count.
    if (closes.length >= 2) {
      const prev = closes[closes.length - 2], last = closes[closes.length - 1];
      if (last.date >= since) {
        const movePct = (last.close / prev.close - 1) * 100;
        if (Math.abs(movePct) >= thresholdPct) {
          priceMove = { date: last.date, prevClose: prev.close, close: last.close, movePct };
        }
      }
    }
    const spark = closes.map((c) => c.close);
    return { symbol, securityId, filings, priceMove, spark, quiet: filings.length === 0 && priceMove === null };
  });
}
