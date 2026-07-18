import type { SecurityRecord } from "./types.js";

export interface ReconcileResult {
  toInsert: SecurityRecord[];
  unchanged: number;
  newSecurities: number;
  deactivated: number;
  warnings: string[];
}

const COMPARE_FIELDS: (keyof SecurityRecord)[] = [
  "cik", "ticker", "share_class", "company_name", "exchange", "country_code",
  "trading_currency", "sic", "sic_description", "sector", "industry", "website",
  "description", "ceo", "headquarters", "employee_count", "founded_year",
  "fiscal_year_end", "is_active", "source",
];

function sameRecord(a: SecurityRecord, b: SecurityRecord): boolean {
  return (
    COMPARE_FIELDS.every((f) => a[f] === b[f]) &&
    JSON.stringify(a.symbol_history) === JSON.stringify(b.symbol_history)
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Match candidates against current rows, allocate security_ids,
 * extend symbol_history on unexplained ticker changes, deactivate
 * rows that disappeared from the SEC file.
 */
export function reconcile(
  candidates: SecurityRecord[],
  current: SecurityRecord[],
  version: number,
): ReconcileResult {
  const warnings: string[] = [];
  const byCikClass = new Map<string, SecurityRecord[]>();
  const byCikTicker = new Map<string, SecurityRecord>();
  const byHistoryTicker = new Map<string, SecurityRecord>();

  for (const row of current) {
    const ck = `${row.cik}:${row.share_class}`;
    byCikClass.set(ck, [...(byCikClass.get(ck) ?? []), row]);
    byCikTicker.set(`${row.cik}:${row.ticker}`, row);
    for (const s of row.symbol_history) byHistoryTicker.set(`${row.cik}:${s.ticker}`, row);
  }

  let nextId = current.reduce((m, r) => Math.max(m, r.security_id), 0) + 1;
  const toInsert: SecurityRecord[] = [];
  let unchanged = 0;
  let newSecurities = 0;
  const seenIds = new Set<number>();

  for (const cand of candidates) {
    // 1. (cik, share_class) — unique hit only
    const classHits = (byCikClass.get(`${cand.cik}:${cand.share_class}`) ?? []).filter(
      (r) => !seenIds.has(r.security_id),
    );
    let match: SecurityRecord | undefined = classHits.length === 1 ? classHits[0] : undefined;
    // 2. (cik, ticker)
    match ??= byCikTicker.get(`${cand.cik}:${cand.ticker}`);
    // 3. ticker in symbol_history
    match ??= byHistoryTicker.get(`${cand.cik}:${cand.ticker}`);
    if (match && seenIds.has(match.security_id)) {
      warnings.push(`ticker ${cand.ticker}: matched security_id ${match.security_id} already claimed this run; treating as new`);
      match = undefined;
    }

    if (!match) {
      cand.security_id = nextId++;
      newSecurities++;
      seenIds.add(cand.security_id);
      toInsert.push(cand);
      continue;
    }

    seenIds.add(match.security_id);
    cand.security_id = match.security_id;

    // Unexplained ticker change: extend history instead of trusting a base-tier default.
    if (match.ticker !== cand.ticker) {
      const explained = cand.symbol_history.some((s) => s.ticker === match!.ticker);
      if (!explained) {
        const closed = match.symbol_history.map((s) =>
          s.valid_to === null ? { ...s, valid_to: today() } : s,
        );
        cand.symbol_history = [
          ...closed,
          { ticker: cand.ticker, exchange: cand.exchange, valid_from: today(), valid_to: null },
        ];
        warnings.push(`ticker change without event data: ${match.ticker} -> ${cand.ticker} (security_id ${match.security_id})`);
      }
    } else if (cand.symbol_history.length === 1 && match.symbol_history.length > 1) {
      // Keep richer stored history over the base-tier single-tuple default.
      cand.symbol_history = match.symbol_history;
    }

    if (sameRecord(cand, match)) unchanged++;
    else toInsert.push(cand);
  }

  // Rows that disappeared from the SEC file -> deactivate.
  let deactivated = 0;
  for (const row of current) {
    if (!seenIds.has(row.security_id) && row.is_active) {
      toInsert.push({ ...row, is_active: false, version });
      deactivated++;
    }
  }

  return { toInsert, unchanged, newSecurities, deactivated, warnings };
}
