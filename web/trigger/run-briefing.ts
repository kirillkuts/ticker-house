import { task } from "@trigger.dev/sdk";
import { runDailyBriefing } from "../lib/briefing";
import { latestDataDate } from "../lib/daily-events";

// On-demand briefing (the "Run now" button). Runs in Trigger, not the Vercel
// request, so multi-stock LLM generation isn't bounded by the serverless
// function timeout. Force-regenerates today's briefing for one user and anchors
// detection to the newest day in the data, so a frozen snapshot still surfaces
// events. Returns the report; the app polls the run for completion.
export const runBriefingNow = task({
  id: "run-briefing-now",
  maxDuration: 600,
  run: async (payload: { userId: string }) => {
    const today = new Date().toISOString().slice(0, 10);
    const dataDate = await latestDataDate();
    const anchor = dataDate && dataDate < today ? dataDate : today;
    const since = new Date(Date.parse(anchor) - 7 * 86400_000).toISOString().slice(0, 10);
    return runDailyBriefing(today, { since, force: true, onlyUserId: payload.userId });
  },
});
