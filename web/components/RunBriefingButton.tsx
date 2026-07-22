"use client";

import { useState, useTransition } from "react";
import { runBriefingNowAction } from "@/app/actions";

// Force-runs today's briefing for the current user and reloads to show it.
// For demos: add stocks to the watchlist, click this, see the briefing (and
// the email) without waiting for the morning cron.
export function RunBriefingButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-neutral-500">{msg}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            try {
              const r = await runBriefingNowAction();
              if (r.briefed === 0) {
                setMsg("Add a stock to your watchlist first.");
                return;
              }
              if (r.errors.length) setMsg(`${r.errors.length} error(s) — see worker logs.`);
              window.location.assign(`/briefing?date=${r.date}`);
            } catch {
              setMsg("Run failed.");
            }
          })
        }
        className="whitespace-nowrap rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "Running…" : "Run briefing now"}
      </button>
    </div>
  );
}
