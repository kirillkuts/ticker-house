"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dashboard } from "@/lib/dashboard";
import { renameDashboardAction, deleteDashboardAction } from "@/app/actions";

// Tabs over the user's dashboards, with inline rename and delete for the
// active one. Navigation via ?d= keeps dashboards linkable.
export function DashboardSwitcher({ dashboards, activeId }: { dashboards: Dashboard[]; activeId: string }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const commitRename = async (id: string) => {
    const name = draft.trim();
    setRenaming(null);
    if (!name) return;
    await renameDashboardAction(id, name).catch(() => {});
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {dashboards.map((d) => {
        const active = d.id === activeId;
        if (renaming === d.id) {
          return (
            <input
              key={d.id}
              aria-label="Dashboard name"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commitRename(d.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename(d.id);
                if (e.key === "Escape") setRenaming(null);
              }}
              className="w-44 rounded-full border border-blue-400 bg-transparent px-3 py-1 text-xs outline-none"
            />
          );
        }
        return (
          <span
            key={d.id}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${
              active
                ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                : "border-neutral-200 text-neutral-500 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
            }`}
          >
            <a href={`/dashboard?d=${d.id}`}>
              {d.name} <span className="text-neutral-400">({d.widgetCount})</span>
            </a>
            {active && (
              <>
                <button
                  type="button"
                  aria-label={`Rename ${d.name}`}
                  title="Rename"
                  onClick={() => {
                    setDraft(d.name);
                    setRenaming(d.id);
                  }}
                  className="text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  ✎
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${d.name}`}
                  title="Delete dashboard"
                  onClick={async () => {
                    if (!window.confirm(`Delete "${d.name}" and its ${d.widgetCount} widget(s)?`)) return;
                    await deleteDashboardAction(d.id).catch(() => {});
                    window.location.assign("/dashboard");
                  }}
                  className="text-neutral-400 hover:text-red-500"
                >
                  ✕
                </button>
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}
