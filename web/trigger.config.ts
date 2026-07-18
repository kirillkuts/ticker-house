import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // Set your project ref from the Trigger.dev dashboard (or run `npx trigger.dev init`).
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_REPLACE_ME",
  dirs: ["./trigger"],
  maxDuration: 3600,
});
