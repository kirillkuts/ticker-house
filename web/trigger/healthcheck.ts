import { task, logger } from "@trigger.dev/sdk";
import { verifyDataConnections } from "../lib/preflight";

// Standalone connection preflight, visible in Trigger's Runs activity. Uses the
// same verifyDataConnections() that runs as the first step of every briefing,
// plus reports required-secret presence. Run it after a deploy or an env change
// to catch a broken connection (wrong DATABASE_URL, missing SSL flag, unset
// key) before it shows up as a failed briefing. Goes RED if a hard dependency
// is down; the logs say which.
export const healthcheck = task({
  id: "healthcheck",
  maxDuration: 60,
  run: async () => {
    let connError: unknown = null;
    try {
      await verifyDataConnections((m) => logger.info(m));
    } catch (e) {
      connError = e;
      logger.error(e instanceof Error ? e.message : String(e));
    }

    // Env presence only — never log values. OPENROUTER is required (chat +
    // briefing); GMAIL/APP_URL are optional (email off / links fall back).
    for (const key of ["OPENROUTER_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD", "APP_URL"]) {
      logger.info(`${key}: ${process.env[key] ? "set" : "unset"}`, { check: key });
    }

    if (connError) throw connError;
    if (!process.env.OPENROUTER_KEY) throw new Error("healthcheck failed: OPENROUTER_KEY unset");
    return { ok: true };
  },
});
