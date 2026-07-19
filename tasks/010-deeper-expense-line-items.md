# 010 — Deeper expense line items in financial_periods

**Status:** done

Resolution: added 5 fields (selling_and_marketing, general_and_admin, depreciation_amortization, amortization_of_intangibles, advertising_expense) to FIELD_DEFS, bumped MAPPING_VERSION to v3, and added ALTER TABLE ADD COLUMN IF NOT EXISTS migration in ensureTables (CREATE IF NOT EXISTS doesn't extend existing tables). Re-ran sync:financials: 10 tickers, 903 periods, quality checks pass. META shows S&M/G&A/D&A for all recent quarters incl. derived Q4; AMZN/GOOGL/MSFT split too; NVDA/TSLA/LLY/AAPL fall back to combined SG&A as expected; BRK-B/JPM sparse (financials). Existing fields unchanged (revenue count still 804).

Extend the fundamentals pipeline with finer income-statement expense lines so questions like "what are Meta's expenses made of" can be answered below the SG&A level. The data is already present in the raw SEC companyfacts JSON we download (verified in data/raw/2026-07-17/facts_*.json); we just don't map it.

Add these fields to `FIELD_DEFS` in src/lib/concepts.ts (bump MAPPING_VERSION), add matching Nullable(Decimal(24,2)) columns to `financial_periods`, and re-run sync:financials:

- `selling_and_marketing` — concepts: SellingAndMarketingExpense (fallback: SellingExpense, MarketingExpense)
- `general_and_admin` — concepts: GeneralAndAdministrativeExpense
- `depreciation_amortization` — concepts: DepreciationDepletionAndAmortization, DepreciationAndAmortization, Depreciation
- `amortization_of_intangibles` — concepts: AmortizationOfIntangibleAssets
- `advertising_expense` — concepts: AdvertisingExpense (note disclosure, sparse)

Known coverage (checked across the 10-ticker universe): AAPL/GOOGL/META/MSFT/AMZN have the S&M vs G&A split; NVDA/TSLA/LLY only report combined SellingGeneralAndAdministrativeExpense (keep that field, consumers fall back to it); BRK-B/JPM are financials with differently shaped statements — expect nulls, don't fight them.

Follow the existing derived-quarter logic in src/lib/normalize-financials.ts (Q4 = FY − Q1-3) for the new duration fields, and keep the existing quality checks passing.

Files: src/lib/concepts.ts, src/lib/sync-financials.ts (column DDL), src/lib/normalize-financials.ts.

Done when: `financial_periods` has the new columns populated for the universe (META shows selling_and_marketing, general_and_admin, depreciation_amortization for recent quarters), sync:financials runs clean including quality checks, and existing fields are unchanged.
