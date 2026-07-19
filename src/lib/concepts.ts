// v2: concept fallback applied per period (a company that switches revenue
// tags mid-history keeps its full series) instead of one concept per field.
export const MAPPING_VERSION = "v2";

export type FieldKind = "duration" | "instant";

export interface FieldDef {
  field: string;
  kind: FieldKind;
  unit: "USD" | "shares" | "USD/shares";
  concepts: string[]; // priority order, us-gaap taxonomy
}

export const FIELD_DEFS: FieldDef[] = [
  // Income statement (durations)
  { field: "revenue", kind: "duration", unit: "USD", concepts: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"] },
  { field: "cost_of_revenue", kind: "duration", unit: "USD", concepts: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"] },
  { field: "gross_profit", kind: "duration", unit: "USD", concepts: ["GrossProfit"] },
  { field: "research_and_development", kind: "duration", unit: "USD", concepts: ["ResearchAndDevelopmentExpense"] },
  { field: "selling_general_admin", kind: "duration", unit: "USD", concepts: ["SellingGeneralAndAdministrativeExpense"] },
  { field: "operating_expenses", kind: "duration", unit: "USD", concepts: ["OperatingExpenses"] },
  { field: "operating_income", kind: "duration", unit: "USD", concepts: ["OperatingIncomeLoss"] },
  { field: "interest_expense", kind: "duration", unit: "USD", concepts: ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt"] },
  { field: "pretax_income", kind: "duration", unit: "USD", concepts: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"] },
  { field: "income_tax", kind: "duration", unit: "USD", concepts: ["IncomeTaxExpenseBenefit"] },
  { field: "net_income", kind: "duration", unit: "USD", concepts: ["NetIncomeLoss"] },
  { field: "basic_eps", kind: "duration", unit: "USD/shares", concepts: ["EarningsPerShareBasic"] },
  { field: "diluted_eps", kind: "duration", unit: "USD/shares", concepts: ["EarningsPerShareDiluted"] },
  { field: "basic_weighted_shares", kind: "duration", unit: "shares", concepts: ["WeightedAverageNumberOfSharesOutstandingBasic"] },
  { field: "diluted_weighted_shares", kind: "duration", unit: "shares", concepts: ["WeightedAverageNumberOfDilutedSharesOutstanding"] },
  // Balance sheet (instants)
  { field: "cash_and_equivalents", kind: "instant", unit: "USD", concepts: ["CashAndCashEquivalentsAtCarryingValue"] },
  { field: "short_term_investments", kind: "instant", unit: "USD", concepts: ["ShortTermInvestments", "MarketableSecuritiesCurrent"] },
  { field: "accounts_receivable", kind: "instant", unit: "USD", concepts: ["AccountsReceivableNetCurrent"] },
  { field: "inventory", kind: "instant", unit: "USD", concepts: ["InventoryNet"] },
  { field: "current_assets", kind: "instant", unit: "USD", concepts: ["AssetsCurrent"] },
  { field: "total_assets", kind: "instant", unit: "USD", concepts: ["Assets"] },
  { field: "accounts_payable", kind: "instant", unit: "USD", concepts: ["AccountsPayableCurrent"] },
  { field: "current_liabilities", kind: "instant", unit: "USD", concepts: ["LiabilitiesCurrent"] },
  { field: "short_term_debt", kind: "instant", unit: "USD", concepts: ["LongTermDebtCurrent", "DebtCurrent"] },
  { field: "long_term_debt", kind: "instant", unit: "USD", concepts: ["LongTermDebtNoncurrent", "LongTermDebt"] },
  { field: "long_term_liabilities", kind: "instant", unit: "USD", concepts: ["LiabilitiesNoncurrent"] },
  { field: "total_liabilities", kind: "instant", unit: "USD", concepts: ["Liabilities"] },
  { field: "shareholders_equity", kind: "instant", unit: "USD", concepts: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"] },
  // Cash flow (durations, usually YTD-only in filings)
  { field: "operating_cash_flow", kind: "duration", unit: "USD", concepts: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"] },
  { field: "capital_expenditure", kind: "duration", unit: "USD", concepts: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"] },
  { field: "acquisitions", kind: "duration", unit: "USD", concepts: ["PaymentsToAcquireBusinessesNetOfCashAcquired"] },
  { field: "share_based_compensation", kind: "duration", unit: "USD", concepts: ["ShareBasedCompensation"] },
  { field: "dividends_paid", kind: "duration", unit: "USD", concepts: ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"] },
  { field: "share_repurchases", kind: "duration", unit: "USD", concepts: ["PaymentsForRepurchaseOfCommonStock"] },
  { field: "debt_issued", kind: "duration", unit: "USD", concepts: ["ProceedsFromIssuanceOfLongTermDebt"] },
  { field: "debt_repaid", kind: "duration", unit: "USD", concepts: ["RepaymentsOfLongTermDebt"] },
];

export const ALL_CONCEPTS = new Set(FIELD_DEFS.flatMap((d) => d.concepts));
