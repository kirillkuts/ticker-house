# 047 — Filings ingestion from EDGAR (021 phase 2)

**Status:** planned

New sync following the existing pattern: `src/lib/sync-filings.ts` + `src/cli/sync-filings.ts`
+ `"sync:filings": "tsx src/cli/sync-filings.ts"` in package.json.

## Source

`data.sec.gov/submissions/CIK##########.json` — `src/lib/sec.ts` already fetches this
payload (`fetchSubmissions`, line ~52) for metadata; the same response carries
`filings.recent` with parallel arrays (accessionNumber, form, filingDate, items,
primaryDocument). Respect the existing EDGAR politeness rules (UA header, ≤10 req/s,
same throttle helper the other syncs use). Apply `data/cik-overrides.txt` like the
other syncs.

## Storage

ClickHouse table `filings` (market data, append-only — the ClickHouse side of the
storage boundary in task 021):
security_id, cik, accession, form, filed_date, items (8-K item codes, comma string),
primary_document, url, ingested_at, version (ReplacingMergeTree on version like the
other tables).

For 8-K / 10-Q / 10-K also fetch the primary document, snapshot the raw HTML under
`data/raw/filings/<cik>/<accession>/`, strip HTML to plain text, and store the text in
the row (a `text` column) so the briefing agent can read it without refetching.
Cap text length sensibly (e.g. 500 KB) — some 10-Ks are enormous.

## Scope

Universe tickers (data/universe.txt) plus any symbol on any user's watchlist that
resolves to a CIK. Sync is incremental: skip accessions already present (SELECT existing
accessions per security_id first).

## Done when

`npm run sync:filings` on a fresh table ingests recent filings for the universe;
re-running is a no-op (no duplicate accessions). 8-K/10-Q/10-K rows carry non-empty
stripped text and a snapshot exists under data/raw/filings/. A watched non-universe
ticker with a resolvable CIK gets rows too. Spot-check one known filing (form, date,
url) against the EDGAR website.
