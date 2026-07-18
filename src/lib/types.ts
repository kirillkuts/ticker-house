export interface SymbolInterval {
  ticker: string;
  exchange: string;
  valid_from: string; // YYYY-MM-DD
  valid_to: string | null;
}

export interface SecurityRecord {
  security_id: number;
  cik: number;
  ticker: string;
  share_class: string;
  company_name: string;
  exchange: string;
  symbol_history: SymbolInterval[];
  country_code: string;
  trading_currency: string;
  sic: number;
  sic_description: string;
  sector: string;
  industry: string;
  website: string;
  description: string;
  ceo: string;
  headquarters: string;
  employee_count: number;
  founded_year: number;
  fiscal_year_end: string;
  is_active: boolean;
  source: string;
  source_updated_at: string; // ISO
  version: number;
}

export interface SyncReport {
  fetchedFromSec: number;
  enriched: number;
  inserted: number;
  unchanged: number;
  newSecurities: number;
  deactivated: number;
  warnings: string[];
  failures: string[];
}
