"use client";

import { useState, useTransition } from "react";
import { runBriefingNowAction, briefingRunStatusAction } from "@/app/actions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Force-runs today's briefing for the current user via a Trigger.dev task
// (so long LLM generation isn't cut off by the serverless timeout), polls the
// run to completion, then reloads to show it. For demos: add stocks to the
// watchlist, click this, see the briefing (and the email).
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
              const { runId } = await runBriefingNowAction();
              const deadline = Date.now() + 180_000;
              while (Date.now() < deadline) {
                await sleep(2000);
                const s = await briefingRunStatusAction(runId);
                if (s.failed) { setMsg("Run failed — see Trigger logs."); return; }
                if (s.done) {
                  if (s.briefed === 0) { setMsg("Add a stock to your watchlist first."); return; }
                  window.location.assign(`/briefing?date=${s.date}`);
                  return;
                }
              }
              setMsg("Still running — check back shortly.");
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
