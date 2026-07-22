import "dotenv/config";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { chClient } from "../lib/clickhouse.js";
import { htmlToText } from "../lib/sync-filings.js";

// One-off backfill: re-run the (fixed) htmlToText over the raw filing HTML
// already snapshotted under data/raw/filings/, and re-insert the text. Needed
// because sync-filings is incremental (it never refetches a stored accession),
// so an htmlToText change doesn't reach existing rows on its own. Reads from
// disk — no EDGAR traffic. Re-inserts with a fresh version; ReplacingMergeTree
// keeps the newest per (security_id, accession).

async function main() {
  const version = Date.now();
  const ch = chClient();
  try {
    const rows = await (
      await ch.query({
        query: `SELECT security_id, cik, accession, form, toString(filed_date) AS filed_date,
                       items, primary_document, url, source
                FROM filings FINAL
                WHERE primary_document != '' AND match(form, '^(10-K|10-Q|8-K)(/A)?$')`,
        format: "JSONEachRow",
      })
    ).json<{
      security_id: number; cik: number; accession: string; form: string; filed_date: string;
      items: string; primary_document: string; url: string; source: string;
    }>();
    console.log(`${rows.length} text-form rows with a primary document`);

    const out: Array<Record<string, unknown>> = [];
    let missing = 0;
    let empty = 0;
    for (const r of rows) {
      const file = path.join(
        "data", "raw", "filings", String(r.cik), r.accession,
        r.primary_document.replace(/[/\\]/g, "_"),
      );
      if (!existsSync(file)) { missing++; continue; }
      const text = htmlToText(await readFile(file, "utf8"));
      if (!text) { empty++; continue; }
      out.push({ ...r, text, version });
    }

    if (out.length) await ch.insert({ table: "filings", values: out, format: "JSONEachRow" });
    await ch.command({ query: "OPTIMIZE TABLE filings FINAL" });
    console.log(`re-stripped ${out.length}; missing raw file ${missing}; empty after strip ${empty}`);
  } finally {
    await ch.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
