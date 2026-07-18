"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { FundamentalsData } from "@/lib/views";

function fmtMoney(v: number | null): string {
  if (v === null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toFixed(0)}`;
}

export function Fundamentals({ data }: { data: FundamentalsData }) {
  const points = data.rows.map((r) => ({
    ...r,
    revenueB: r.revenue !== null ? r.revenue / 1e9 : null,
    netIncomeB: r.netIncome !== null ? r.netIncome / 1e9 : null,
  }));

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 my-2 space-y-4">
      <div>
        <span className="font-semibold">{data.companyName}</span>{" "}
        <span className="text-neutral-500 text-sm">
          {data.ticker} · {data.periodType === "quarter" ? "quarterly" : "annual"} fundamentals
        </span>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={points}>
          <XAxis dataKey="fiscalLabel" fontSize={11} />
          <YAxis yAxisId="money" fontSize={11} width={50} tickFormatter={(v: number) => `$${v}B`} />
          <YAxis yAxisId="pct" orientation="right" fontSize={11} width={40}
                 tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
          <Tooltip />
          <Legend />
          <Bar yAxisId="money" dataKey="revenueB" name="Revenue ($B)" fill="#60a5fa" />
          <Bar yAxisId="money" dataKey="netIncomeB" name="Net income ($B)" fill="#34d399" />
          <Line yAxisId="pct" type="monotone" dataKey="netMarginPct" name="Net margin %"
                stroke="#f59e0b" dot strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-neutral-500 text-left">
            <th className="py-1 font-normal">Period</th>
            <th className="py-1 font-normal text-right">Revenue</th>
            <th className="py-1 font-normal text-right">Net income</th>
            <th className="py-1 font-normal text-right">Diluted EPS</th>
            <th className="py-1 font-normal text-right">FCF</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.periodEnd} className="border-t border-neutral-100 dark:border-neutral-800">
              <td className="py-1">{r.fiscalLabel}</td>
              <td className="py-1 text-right">{fmtMoney(r.revenue)}</td>
              <td className="py-1 text-right">{fmtMoney(r.netIncome)}</td>
              <td className="py-1 text-right">{r.dilutedEps?.toFixed(2) ?? "—"}</td>
              <td className="py-1 text-right">{fmtMoney(r.freeCashFlow)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
