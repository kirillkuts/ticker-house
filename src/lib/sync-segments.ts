import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { chClient, type CH } from "./clickhouse.js";

// SEC Financial Statement Data Sets: quarterly ZIPs with every numeric fact
// from every filing, including dimensional (segment) facts that the
// companyfacts API drops. https://www.sec.gov/files/financial-statement-data-sets.pdf
const FSDS_URL = (q: string) => `https://www.sec.gov/files/dera/data/financial-statement-data-sets/${q}.zip`;
const UA = { "User-Agent": "TickerHouse kirill.kuts.dev@gmail.com" };

// Concepts worth splitting by segment. Revenue is a fallback chain like FIELD_DEFS.
const SEGMENT_CONCEPTS = new Set([
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "Revenues",
  "SalesRevenueNet",
  "OperatingIncomeLoss",
  "Assets",
  "DepreciationDepletionAndAmortization",
]);

// segments field axis names (Statement prefix and Axis/Member suffixes already
// stripped by the SEC) -> our axis enum.
const AXIS_MAP: Record<string, "business" | "geography" | "product"> = {
  BusinessSegments: "business",
  Geographical: "geography",
  ProductOrService: "product",
};
const CONSOLIDATION_AXIS = "ConsolidationItems";

export interface SegmentsReport {
  quarters: string[];
  rowsScanned: number;
  factsInserted: number;
  warnings: string[];
  failures: string[];
}

interface SegmentFact {
  security_id: number;
  cik: number;
  period_end: string; // ISO date
  qtrs: number; // duration in quarters; 0 = instant
  concept: string;
  axis: "business" | "geography" | "product";
  member: string;
  member_label: string;
  consolidation_member: string;
  value: number;
  uom: string;
  form: string;
  adsh: string;
  filed_date: string; // ISO date
}

async function ensureTable(ch: CH) {
  await ch.command({
    query: `
CREATE TABLE IF NOT EXISTS financial_segments
(
    security_id UInt32,
    cik UInt32,
    period_end Date,
    qtrs UInt8,
    concept LowCardinality(String),
    axis LowCardinality(String),
    member String,
    member_label String DEFAULT '',
    consolidation_member LowCardinality(String) DEFAULT '',
    value Decimal(38, 4),
    uom LowCardinality(String),
    form LowCardinality(String),
    adsh String,
    filed_date Date,
    source LowCardinality(String) DEFAULT 'sec-fsds',
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3),
    version UInt64
)
ENGINE = ReplacingMergeTree(version)
ORDER BY (security_id, concept, axis, member, period_end, qtrs)`,
  });
}

/** Last n quarters that could have a published FSDS file, newest last. */
export function recentQuarters(n: number, today = new Date()): string[] {
  const out: string[] = [];
  let year = today.getUTCFullYear();
  let q = Math.floor(today.getUTCMonth() / 3) + 1;
  for (let i = 0; i < n; i++) {
    out.unshift(`${year}q${q}`);
    q--;
    if (q === 0) { q = 4; year--; }
  }
  return out;
}

/** Download a quarter ZIP into the immutable cache; returns null on 404 (not published yet). */
async function fetchQuarterZip(q: string, log: (m: string) => void): Promise<string | null> {
  const dir = path.join("data", "raw", "fsds");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${q}.zip`);
  if (existsSync(file)) return file;
  log(`downloading FSDS ${q}.zip`);
  const res = await fetch(FSDS_URL(q), { headers: UA });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`FSDS ${q} -> HTTP ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

/** Stream one TSV member of a ZIP line by line without extracting to disk. */
async function streamZipTsv(zipPath: string, member: string, onRow: (cols: string[], header: Map<string, number>) => void) {
  const child = spawn("unzip", ["-p", zipPath, member], { stdio: ["ignore", "pipe", "pipe"] });
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let header: Map<string, number> | null = null;
  for await (const line of rl) {
    const cols = line.split("\t");
    if (!header) {
      header = new Map(cols.map((c, i) => [c.trim(), i]));
      continue;
    }
    onRow(cols, header);
  }
  const code = await new Promise<number>((r) => child.on("close", r));
  if (code !== 0) throw new Error(`unzip -p ${zipPath} ${member} exited ${code}`);
}

const isoDate = (yyyymmdd: string) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

/** "FamilyOfApps" -> "Family Of Apps" (display convenience; raw member is kept). */
const humanize = (member: string) => member.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim();

/** Parse "Axis=Member;Axis=Member;" into pairs; null if malformed. */
function parseSegments(segments: string): [string, string][] | null {
  const pairs: [string, string][] = [];
  for (const part of segments.split(";")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq <= 0) return null;
    pairs.push([part.slice(0, eq), part.slice(eq + 1)]);
  }
  return pairs.length > 0 ? pairs : null;
}

export async function syncSegments(quartersBack = 12, log: (msg: string) => void = console.log): Promise<SegmentsReport> {
  const version = Date.now();
  const warnings: string[] = [];
  const ch = chClient();

  try {
    await ensureTable(ch);

    const universe = (await readFile("data/universe.txt", "utf8"))
      .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    const secRows = await (
      await ch.query({
        query: `SELECT security_id, cik, ticker FROM securities FINAL
                WHERE is_active AND ticker IN ({tickers:Array(String)})`,
        query_params: { tickers: universe },
        format: "JSONEachRow",
      })
    ).json<{ security_id: number; cik: number; ticker: string }>();
    const byCik = new Map(secRows.map((s) => [s.cik, s]));

    const quarters = recentQuarters(quartersBack);
    const processed: string[] = [];
    let rowsScanned = 0;
    // Latest-filed fact wins per logical key; a plain row and its
    // ConsolidationItems=OperatingSegments twin collapse to one row here too.
    const best = new Map<string, SegmentFact>();

    for (const q of quarters) {
      const zip = await fetchQuarterZip(q, log);
      if (!zip) { warnings.push(`FSDS ${q} not published yet, skipped`); continue; }

      // sub.txt: which accessions in this quarter belong to our universe.
      const subs = new Map<string, { cik: number; form: string; filed: string }>();
      await streamZipTsv(zip, "sub.txt", (cols, h) => {
        const cik = Number(cols[h.get("cik")!]);
        if (!byCik.has(cik)) return;
        const form = cols[h.get("form")!];
        if (!/^10-[KQ](\/A)?$/.test(form)) return;
        subs.set(cols[h.get("adsh")!], { cik, form, filed: isoDate(cols[h.get("filed")!]) });
      });

      let kept = 0;
      await streamZipTsv(zip, "num.txt", (cols, h) => {
        rowsScanned++;
        const sub = subs.get(cols[h.get("adsh")!]);
        if (!sub) return;
        const segments = cols[h.get("segments")!];
        if (!segments) return;
        if (cols[h.get("coreg")!]) return;
        const tag = cols[h.get("tag")!];
        if (!SEGMENT_CONCEPTS.has(tag)) return;
        const uom = cols[h.get("uom")!];
        if (uom !== "USD") return;
        const rawValue = cols[h.get("value")!];
        if (!rawValue) return;
        const qtrs = Number(cols[h.get("qtrs")!]);
        if (![0, 1, 4].includes(qtrs)) return;

        const pairs = parseSegments(segments);
        if (!pairs) return;
        const dims = pairs.filter(([axis]) => axis !== CONSOLIDATION_AXIS);
        const consolidation = pairs.find(([axis]) => axis === CONSOLIDATION_AXIS)?.[1] ?? "";
        // Exactly one segment axis; the ConsolidationItems cross is allowed but
        // only for the plain operating-segments layer (eliminations and
        // corporate reconciling rows are not segment amounts).
        if (dims.length !== 1) return;
        const [axisName, member] = dims[0];
        const axis = AXIS_MAP[axisName];
        if (!axis) return;
        if (consolidation && consolidation !== "OperatingSegments") return;

        const sec = byCik.get(sub.cik)!;
        const fact: SegmentFact = {
          security_id: sec.security_id,
          cik: sub.cik,
          period_end: isoDate(cols[h.get("ddate")!]),
          qtrs,
          concept: tag,
          axis,
          member,
          member_label: humanize(member),
          consolidation_member: consolidation,
          value: Number(rawValue),
          uom,
          form: sub.form,
          adsh: cols[h.get("adsh")!],
          filed_date: sub.filed,
        };
        const key = `${fact.security_id}|${fact.concept}|${fact.axis}|${fact.member}|${fact.period_end}|${fact.qtrs}`;
        const prev = best.get(key);
        if (!prev || fact.filed_date > prev.filed_date) { best.set(key, fact); kept++; }
      });

      processed.push(q);
      log(`${q}: ${subs.size} universe filings, ${kept} segment facts kept`);
    }

    const facts = [...best.values()];
    if (facts.length > 0) {
      await ch.insert({
        table: "financial_segments",
        values: facts.map((f) => ({ ...f, version })),
        format: "JSONEachRow",
      });
    }

    const failures = await qualityChecks(ch, warnings);
    const report: SegmentsReport = { quarters: processed, rowsScanned, factsInserted: facts.length, warnings, failures };
    log(JSON.stringify({ ...report, warnings, failures }, null, 2));
    if (failures.length > 0) throw new Error(`quality checks failed: ${failures.join("; ")}`);
    return report;
  } finally {
    await ch.close();
  }
}

async function qualityChecks(ch: CH, warnings: string[]): Promise<string[]> {
  const failures: string[] = [];

  const dup = await (
    await ch.query({
      query: `SELECT count() AS c FROM (
                SELECT security_id, concept, axis, member, period_end, qtrs
                FROM financial_segments FINAL
                GROUP BY security_id, concept, axis, member, period_end, qtrs HAVING count() > 1)`,
      format: "JSONEachRow",
    })
  ).json<{ c: string }>();
  if (Number(dup[0].c) > 0) failures.push(`${dup[0].c} duplicate segment keys`);

  // Business-segment revenue should roughly reconcile to consolidated revenue.
  // Differences come from corporate/reconciling items, so warn, don't fail.
  const recon = await (
    await ch.query({
      query: `
        SELECT s.security_id AS sid, toString(s.period_end) AS pe,
               round(abs(seg_rev - toFloat64(p.revenue)) / toFloat64(p.revenue), 3) AS drift
        FROM (
          SELECT security_id, period_end, sum(toFloat64(value)) AS seg_rev
          FROM financial_segments FINAL
          WHERE axis = 'business'
            AND concept IN ('RevenueFromContractWithCustomerExcludingAssessedTax',
                            'RevenueFromContractWithCustomerIncludingAssessedTax', 'Revenues', 'SalesRevenueNet')
            AND qtrs = 4
          GROUP BY security_id, period_end
        ) s
        JOIN (SELECT security_id, period_end, revenue FROM financial_periods FINAL
              WHERE period_type = 'annual' AND revenue IS NOT NULL) p
          ON p.security_id = s.security_id AND p.period_end = s.period_end
        WHERE drift > 0.02`,
      format: "JSONEachRow",
    })
  ).json<{ sid: number; pe: string; drift: number }>();
  for (const r of recon) warnings.push(`segment revenue drifts ${r.drift} from consolidated: security_id ${r.sid}, FY end ${r.pe}`);

  return failures;
}
