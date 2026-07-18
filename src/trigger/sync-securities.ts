import { schedules } from "@trigger.dev/sdk";
import { syncSecurities } from "../lib/sync-securities.js";

export const syncSecuritiesTask = schedules.task({
  id: "sync-securities",
  cron: "0 6 * * 1", // Mondays 06:00 UTC — weekly security-master refresh
  maxDuration: 6 * 60 * 60, // enrichment is rate-limited to 5 req/min
  run: async () => {
    return syncSecurities();
  },
});
