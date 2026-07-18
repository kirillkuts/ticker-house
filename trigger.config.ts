import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // Replace with your project ref from the Trigger.dev dashboard.
  project: "proj_REPLACE_ME",
  dirs: ["./src/trigger"],
  maxDuration: 3600,
});
