"use client";

import type { SingleStockPriceData, FundamentalsData, CompanyOverviewData, ExpenseBreakdownData, SegmentBreakdownData, CategorySnapshot } from "@/lib/views";
import type { MetricQueryResult } from "@/lib/metric-query";
import { SingleStockPrice } from "./widgets/SingleStockPrice";
import { Fundamentals } from "./widgets/Fundamentals";
import { MetricResult } from "./widgets/MetricResult";
import { CompanyOverview } from "./widgets/CompanyOverview";
import { ExpenseBreakdown } from "./widgets/ExpenseBreakdown";
import { SegmentBreakdown } from "./widgets/SegmentBreakdown";
import { CategoryView } from "./CategoryView";

// One place that maps a view tool name to its widget. Used by the chat's
// tool parts and by the dashboard's saved recipes, so the two can't drift.
export function ViewBody({ tool, output }: { tool: string; output: unknown }) {
  switch (tool) {
    case "show_company_overview":
      return <CompanyOverview data={output as CompanyOverviewData} />;
    case "show_price_chart":
      return <SingleStockPrice data={output as SingleStockPriceData} />;
    case "show_fundamentals":
      return <Fundamentals data={output as FundamentalsData} />;
    case "show_expense_breakdown":
      return <ExpenseBreakdown data={output as ExpenseBreakdownData} />;
    case "show_segments":
      return <SegmentBreakdown data={output as SegmentBreakdownData} />;
    case "show_category":
      return <CategoryView data={output as CategorySnapshot} />;
    case "query_metrics":
      return <MetricResult data={output as MetricQueryResult} />;
    default:
      return null;
  }
}
