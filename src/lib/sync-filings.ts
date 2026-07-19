import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chClient, type CH } from "./clickhouse.js";
import { loadCikOverrides, applyCikOverrides } from "./cik-overrides.js";
import { fetchSecSubmissions, fetchFilingDocument, filingDocumentUrl } from "./sec.js";

// EDGAR filings per company from the submissions JSON (the same payload
// sync-securities already reads for metadata). Metadata rows for every recent
// filing; for 8-K / 10-Q / 10-K filed within the text window we also fetch the
// primary document, snapshot the raw HTML under data/raw/filings/ and store
// stripped text so the briefing agent (task 049) reads it without refetching.

const TEXT_FORMS = /^(10-K|10-Q|8-K)(\/A)?$/;
const TEXT_MAX_CHARS = 500_000; // some 10-Ks are enormous
const THROTTLE_MS = 130; // sequential anyway; stays far under EDGAR's 10 req/s

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FilingsReport {
  tickers: number;
  filingsSeen: number;
  rowsInserted: number;
  textFetched: number;
  warnings: string[];
  failures: string[];
}

interface FilingRow {
  security_id: number;
  cik: number;
  accession: string;
  form: string;
  filed_date: string;
  items: string;
  primary_document: string;
  url: string;
  text: string;
}

async function ensureTable(ch: CH) {
  await ch.command({
    query: `
CREATE TABLE IF NOT EXISTS filings
(
    security_id UInt32,
    cik UInt32,
    accession String,
    form LowCardinality(String),
    filed_date Date,
    items String DEFAULT '',
    primary_document String DEFAULT '',
    url String DEFAULT '',
    text String DEFAULT '',
    source LowCardinality(String) DEFAULT 'sec-submissions',
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3),
    version UInt64
)
ENGINE = ReplacingMergeTree(version)
ORDER BY (security_id, accession)`,
  });
}

// Good enough for filings: the agent needs readable prose, not fidelity.
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TEXT_MAX_CHARS);
}

// Watchlist symbols from Postgres (app data). The sync must not depend on the
// app database being up — failure degrades to universe-only with a warning.
async function watchedSymbols(warnings: string[]): Promise<string[]> {
  try {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL ?? "postgresql://ticker:ticker@localhost:5432/ticker_house",
      max: 2,
    });
    try {
      const res = await pool.query<{ symbol: string }>(
        "SELECT DISTINCT symbol FROM watchlist WHERE removed_at IS NULL",
      );
      return res.rows.map((r) => r.symbol);
    } finally {
      await pool.end();
    }
  } catch (e) {
    warnings.push(`watchlist read failed (${e instanceof Error ? e.message : e}); syncing universe only`);
    return [];
  }
}

export async function syncFilings(textDays = 90, log: (msg: string) => void = console.log): Promise<FilingsReport> {
  const version = Date.now();
  const warnings: string[] = [];
  const textCutoff = new Date(Date.now() - textDays * 86400_000).toISOString().slice(0, 10);
  const ch = chClient();

  try {
    await ensureTable(ch);

    const universe = (await readFile("data/universe.txt", "utf8"))
      .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    const watched = await watchedSymbols(warnings);
    const tickers = [...new Set([...universe, ...watched.map((s) => s.toUpperCase())])];

    const secRows = applyCikOverrides(
      await (
        await ch.query({
          query: `SELECT security_id, cik, ticker FROM securities FINAL
                  WHERE is_active AND cik > 0 AND ticker IN ({tickers:Array(String)})`,
          query_params: { tickers },
          format: "JSONEachRow",
        })
      ).json<{ security_id: number; cik: number; ticker: string }>(),
      await loadCikOverrides(),
      log,
    );
    for (const t of tickers) {
      if (!secRows.some((s) => s.ticker === t)) warnings.push(`${t}: no active security with a CIK, skipped`);
    }

    // Incremental: accessions already stored never refetch their documents.
    const existing = new Set(
      (
        await (
          await ch.query({
            query: `SELECT DISTINCT security_id, accession FROM filings`,
            format: "JSONEachRow",
          })
        ).json<{ security_id: number; accession: string }>()
      ).map((r) => `${r.security_id}|${r.accession}`),
    );

    const rows: FilingRow[] = [];
    let filingsSeen = 0;
    let textFetched = 0;

    for (const sec of secRows) {
      await sleep(THROTTLE_MS);
      const submissions = await fetchSecSubmissions(sec.cik);
      const recent = submissions?.filings?.recent;
      if (!recent?.accessionNumber?.length) {
        warnings.push(`${sec.ticker}: no recent filings in submissions JSON`);
        continue;
      }
      let added = 0;
      for (let i = 0; i < recent.accessionNumber.length; i++) {
        filingsSeen++;
        const accession = recent.accessionNumber[i];
        if (existing.has(`${sec.security_id}|${accession}`)) continue;
        const form = recent.form[i] ?? "";
        const filed = recent.filingDate[i] ?? "";
        if (!accession || !form || !filed) continue;
        const primaryDocument = recent.primaryDocument[i] ?? "";

        let text = "";
        if (TEXT_FORMS.test(form) && filed >= textCutoff && primaryDocument) {
          await sleep(THROTTLE_MS);
          const html = await fetchFilingDocument(sec.cik, accession, primaryDocument);
          if (html === null) {
            warnings.push(`${sec.ticker} ${accession}: document fetch failed (${primaryDocument})`);
          } else {
            const dir = path.join("data", "raw", "filings", String(sec.cik), accession);
            await mkdir(dir, { recursive: true });
            await writeFile(path.join(dir, primaryDocument.replace(/[/\\]/g, "_")), html);
            text = htmlToText(html);
            textFetched++;
          }
        }

        rows.push({
          security_id: sec.security_id,
          cik: sec.cik,
          accession,
          form,
          filed_date: filed,
          items: recent.items[i] ?? "",
          primary_document: primaryDocument,
          url: primaryDocument ? filingDocumentUrl(sec.cik, accession, primaryDocument) : "",
          text,
        });
        added++;
      }
      log(`${sec.ticker}: ${added} new filings`);
    }

    if (rows.length > 0) {
      await ch.insert({
        table: "filings",
        values: rows.map((r) => ({ ...r, version })),
        format: "JSONEachRow",
      });
    }

    const failures = await qualityChecks(ch, textCutoff);
    const report: FilingsReport = {
      tickers: secRows.length,
      filingsSeen,
      rowsInserted: rows.length,
      textFetched,
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

async function qualityChecks(ch: CH, textCutoff: string): Promise<string[]> {
  const failures: string[] = [];

  const dup = await (
    await ch.query({
      query: `SELECT count() AS c FROM (
                SELECT security_id, accession FROM filings FINAL
                GROUP BY security_id, accession HAVING count() > 1)`,
      format: "JSONEachRow",
    })
  ).json<{ c: string }>();
  if (Number(dup[0].c) > 0) failures.push(`${dup[0].c} duplicate (security_id, accession) keys`);

  // The whole point is text the agent can read: recent text-form filings with
  // an empty text column mean the document fetch path is broken.
  const cov = await (
    await ch.query({
      query: `SELECT countIf(text != '') AS with_text, count() AS total
              FROM filings FINAL
              WHERE match(form, '^(10-K|10-Q|8-K)') AND filed_date >= {cutoff:Date}`,
      query_params: { cutoff: textCutoff },
      format: "JSONEachRow",
    })
  ).json<{ with_text: string; total: string }>();
  const { with_text, total } = cov[0];
  if (Number(total) > 0 && Number(with_text) === 0) failures.push(`0 of ${total} recent text-form filings carry text`);

  return failures;
}
