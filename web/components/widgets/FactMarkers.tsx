"use client";

import { createContext, useContext, useState } from "react";

// Fact anchors (task 029): the model's highlight_facts tool maps sentences of
// its explanation to table cells. Chat.tsx collects the markers per assistant
// message and provides them here; widgets render a pulsing dot beside each
// referenced value, with the sentence as a hover tooltip.

export interface FactMarker {
  ticker?: string;
  period: string;
  column: string;
  snippet: string;
}

export const FactMarkersContext = createContext<FactMarker[]>([]);

// Loose match so "FY2025" hits "FY2025" and "Sep 2025" hits "Sep 2025" even
// if casing/spacing drift a little in the model's copy of the label. Null-safe:
// a malformed marker from the model (missing period/column) must be ignored,
// never crash the whole widget render.
const norm = (s: string | undefined | null) => (s ?? "").toLowerCase().replace(/[\s'’]/g, "");

export function useFactMarkers(ticker: string) {
  const markers = useContext(FactMarkersContext);
  const tk = (ticker ?? "").toUpperCase();
  return (periodLabel: string, column: string): FactMarker[] =>
    markers.filter(
      (m) =>
        !!m.period &&
        m.column === column &&
        norm(m.period) === norm(periodLabel) &&
        (!m.ticker || m.ticker.toUpperCase() === tk),
    );
}

const TIP_WIDTH = 240;

// A pulsing dot beside a referenced value. Hover shows the explanation
// sentence in a fixed-position tooltip (tables live in overflow containers).
export function FactDot({ markers }: { markers: FactMarker[] }) {
  const [tip, setTip] = useState<{ left: number; top: number } | null>(null);
  if (markers.length === 0) return null;
  return (
    <span
      className="relative ml-1.5 inline-flex h-4 w-4 items-center justify-center cursor-help align-middle"
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const left = Math.min(
          Math.max(r.left + r.width / 2 - TIP_WIDTH / 2, 8),
          window.innerWidth - TIP_WIDTH - 8,
        );
        setTip({ left, top: r.bottom + 6 });
      }}
      onMouseLeave={() => setTip(null)}
    >
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: "var(--viz-1)" }} />
      <span className="relative inline-flex h-3 w-3 rounded-full" style={{ background: "var(--viz-1)" }} />
      {tip && (
        <span
          className="fixed z-50 rounded-lg border p-2.5 text-left text-[11px] font-normal leading-snug shadow-md pointer-events-none whitespace-normal"
          style={{
            left: tip.left, top: tip.top, width: TIP_WIDTH,
            background: "var(--tooltip-bg)", borderColor: "var(--tooltip-border)",
            color: "var(--foreground)",
          }}
        >
          {markers.map((m) => m.snippet).join(" · ")}
        </span>
      )}
    </span>
  );
}
