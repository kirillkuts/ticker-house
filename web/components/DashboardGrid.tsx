"use client";

import { useEffect, useState } from "react";
import { removeDashboardWidgetAction } from "@/app/actions";
import { AskContext } from "./widgets/FollowUps";
import { ViewBody } from "./ViewBody";
import { recordOpen } from "./interest";

export interface DashboardWidgetData {
  widgetId: string;
  tool: string;
  input?: Record<string, unknown>;
  output: unknown;
}

// Saved widgets rendered with live data. Chips inside widgets still work:
// here ask() seeds a brand-new chat with the question instead of continuing
// a conversation.
export function DashboardGrid({ widgets }: { widgets: DashboardWidgetData[] }) {
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const visible = widgets.filter((w) => !removed.has(w.widgetId));

  // Loading the dashboard opens every saved single-stock view (task 046);
  // recordOpen debounces per session per ticker.
  useEffect(() => {
    for (const w of widgets) {
      if (typeof w.input?.ticker === "string") recordOpen(w.input.ticker, "dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = (text: string) => {
    window.location.assign(`/?ask=${encodeURIComponent(text)}`);
  };

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-sm text-neutral-500">
        Nothing saved yet. In a chat, hover a widget and hit “☆ save” to pin it here with live data.
      </div>
    );
  }

  return (
    <AskContext.Provider value={{ ask, busy: false }}>
      <div className="space-y-6">
        {visible.map((w) => {
          const failed = Boolean(w.output && typeof w.output === "object" && "error" in (w.output as object));
          return (
            <div key={w.widgetId} className="group relative">
              <button
                type="button"
                onClick={() => {
                  setRemoved((prev) => new Set(prev).add(w.widgetId));
                  removeDashboardWidgetAction(w.widgetId).catch(() => {});
                }}
                className="absolute right-3 top-5 z-10 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs text-neutral-500 opacity-0 transition-opacity group-hover:opacity-100 hover:border-red-400 hover:text-red-500"
              >
                remove
              </button>
              {failed ? (
                <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/30 p-3 text-sm text-red-600 dark:text-red-400">
                  {(w.output as { error: string }).error}
                </div>
              ) : (
                <ViewBody tool={w.tool} output={w.output} />
              )}
            </div>
          );
        })}
      </div>
    </AskContext.Provider>
  );
}
