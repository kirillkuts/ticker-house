# 011 — Segment data pipeline (SEC Financial Statement Data Sets)

**Status:** done

Resolution: built src/lib/sync-segments.ts + src/cli/sync-segments.ts (`npm run sync:segments -- --quarters=N`, default 12). ZIPs cached immutably under data/raw/fsds/, streamed via `unzip -p` (never fully in memory). Dedup at insert: latest-filed fact wins per (security_id, concept, axis, member, period_end, qtrs); plain and ConsolidationItems=OperatingSegments twins collapse; eliminations/corporate reconciling rows dropped. Ran over 2023q4-2026q1 (2026q2+ not published yet): 36M rows scanned, 2,261 facts into new `financial_segments` table, quality checks pass. META verified against filings: FamilyOfApps op income 102.47B / RealityLabs -19.19B FY2025, geography rows present. All 10 tickers have data; TSLA reports segments on the product axis, JPM only segment assets (banks tag segment revenue with bank-specific concepts — future extension), BRK-B revenue drift vs consolidated is a logged warning (conglomerate, expected).

New ingestion path for business/geographic/product segment data (e.g. Meta: Family of Apps vs Reality Labs). The Company Facts API we use today structurally drops dimensional facts, so this needs a second source: the SEC Financial Statement Data Sets (FSDS) — quarterly ZIPs with every numeric fact from every US filing, including a `segments` column since the Dec 2024 reprocessing. Verified: the 2026Q1 file contains Meta rows like `OperatingIncomeLoss ... BusinessSegments=FamilyOfApps; ... 102469000000` and `RevenueFromContractWithCustomerExcludingAssessedTax ... Geographical=Europe;`.

Source:
- URL pattern: https://www.sec.gov/files/dera/data/financial-statement-data-sets/{yyyy}q{n}.zip (60–125 MB/quarter, 2009q1–present)
- Inside: sub.txt, num.txt, tag.txt, pre.txt (tab-separated). num.txt columns: adsh, tag, version, ddate, qtrs, uom, segments, coreg, value, footnote. Docs: https://www.sec.gov/files/financial-statement-data-sets.pdf
- Same politeness rules as EDGAR: descriptive User-Agent, ≤10 req/s.

Build `npm run sync:segments` (src/cli/sync-segments.ts + src/lib/sync-segments.ts), following the existing pattern: download → snapshot ZIP under data/raw/<date>/ → parse → insert → quality checks.

Parsing rules:
- Join num.txt to sub.txt on adsh; resolve company by CIK (never ticker — FB-era accessions carry old names).
- Keep rows whose segments field has exactly one of the axes BusinessSegments=, Geographical=, ProductOrService= (plus optionally crossed with ConsolidationItems=OperatingSegments). Skip other axes (EquityComponents etc.).
- Double-count trap: some filers tag segment facts with BusinessSegments alone (Meta), others cross with ConsolidationItems=OperatingSegments. Normalize so each (segment, concept, period) appears once. Exclude IntersegmentElimination / MaterialReconcilingItems / CorporateNonSegment members from segment sums but keep them stored.
- Keep only concepts we care about initially: the revenue chain, OperatingIncomeLoss, Assets, DepreciationDepletionAndAmortization.
- Period from ddate (period end) + qtrs (duration; 0 = instant). Never trust fiscal_year labels.

New ClickHouse table `financial_segments` (ReplacingMergeTree(version), same insert-only style as financial_periods):
security_id, cik, period_end, qtrs, concept, axis (business|geography|product), member (raw, e.g. FamilyOfApps), member_label Nullable, consolidation_member Nullable, value Decimal(38,4), uom, form, adsh, filed_date, source, ingested_at, version.
Segment member names are company-specific by nature — store as-is, never normalize across companies.

Scope now: current 10-ticker universe, last ~12 quarterly ZIPs (covers FY2023+). Design so running over all filers / full 2009+ history is only a parameter change (the ZIPs already contain everyone).

Quality checks: sum of business-segment revenue per period ≈ consolidated revenue in financial_periods (within reconciling-item tolerance); no duplicate (security_id, period_end, qtrs, concept, axis, member) after dedup.

Files: src/cli/sync-segments.ts, src/lib/sync-segments.ts (new), package.json script.

Done when: `financial_segments` holds Meta's Family of Apps / Reality Labs revenue and operating income for recent fiscal years plus geographic revenue, all 10 universe tickers ingested (financials like BRK-B/JPM may legitimately have sparse segment data), quality checks pass.
