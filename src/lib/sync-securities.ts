import { readFile } from "node:fs/promises";
import { fetchSecTickerFile, fetchSecSubmissions, saveRaw } from "./sec.js";
import { fetchTickerDetails, fetchTickerEvents } from "./massive.js";
import { normalizeSecurity } from "./normalize.js";
import { reconcile } from "./reconcile.js";
import {
  chClient, ensureSecuritiesTable, loadCurrentSecurities,
  insertSecurities, runQualityChecks,
} from "./clickhouse.js";
import type { SecurityRecord, SyncReport } from "./types.js";

async function loadUniverse(): Promise<string[]> {
  try {
    const text = await readFile("data/universe.txt", "utf8");
    return text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  } catch {
    return [];
  }
}

export async function syncSecurities(log: (msg: string) => void = console.log): Promise<SyncReport> {
  const version = Date.now();
  const fetchedAt = new Date().toISOString();
  const date = fetchedAt.slice(0, 10);
  const warnings: string[] = [];

  log("fetching SEC ticker file");
  const secRows = (await fetchSecTickerFile()).filter((r) => r.ticker && r.name);
  await saveRaw(date, "sec_tickers.json", secRows);
  log(`SEC file: ${secRows.length} rows`);

  const universe = await loadUniverse();
  const universeSet = new Set(universe);
  log(`universe: ${universe.length} tickers to enrich`);

  const candidates: SecurityRecord[] = [];
  let enriched = 0;
  for (const base of secRows) {
    if (!universeSet.has(base.ticker)) {
      candidates.push(normalizeSecurity({ base, submissions: null, details: null, events: [], fetchedAt, version }));
      continue;
    }
    log(`enriching ${base.ticker}`);
    const submissions = await fetchSecSubmissions(base.cik);
    if (!submissions) warnings.push(`${base.ticker}: no SEC submissions for CIK ${base.cik}`);
    const details = await fetchTickerDetails(base.ticker);
    if (!details) warnings.push(`${base.ticker}: no Massive details`);
    const events = await fetchTickerEvents(base.ticker);
    await saveRaw(date, `enrich_${base.ticker}.json`, { submissions, details, events });
    candidates.push(normalizeSecurity({ base, submissions, details, events, fetchedAt, version }));
    enriched++;
  }

  const missingUniverse = universe.filter((t) => !secRows.some((r) => r.ticker === t));
  for (const t of missingUniverse) warnings.push(`universe ticker ${t} not in SEC file`);

  const ch = chClient();
  try {
    await ensureSecuritiesTable(ch);
    const current = await loadCurrentSecurities(ch);
    log(`current ClickHouse rows: ${current.length}`);

    // Count-drift guard before touching the table.
    if (current.length > 0 && secRows.length < current.filter((r) => r.is_active).length * 0.95) {
      throw new Error(
        `SEC file has ${secRows.length} rows, more than 5% below current active count; aborting`,
      );
    }

    const result = reconcile(candidates, current, version);
    warnings.push(...result.warnings);

    log(`inserting ${result.toInsert.length} rows (new: ${result.newSecurities}, deactivated: ${result.deactivated})`);
    await insertSecurities(ch, result.toInsert);

    const failures = await runQualityChecks(ch, universe);
    const report: SyncReport = {
      fetchedFromSec: secRows.length,
      enriched,
      inserted: result.toInsert.length,
      unchanged: result.unchanged,
      newSecurities: result.newSecurities,
      deactivated: result.deactivated,
      warnings,
      failures,
    };
    log(JSON.stringify(report, null, 2));
    if (failures.length > 0) throw new Error(`quality checks failed: ${failures.join("; ")}`);
    return report;
  } finally {
    await ch.close();
  }
}
