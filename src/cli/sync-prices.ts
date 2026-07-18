import "dotenv/config";
import { syncDailyPrices } from "../lib/sync-daily-prices.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Default: last completed trading day (yesterday; weekends skipped inside).
const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
const from = arg("from") ?? yesterday;
const to = arg("to") ?? from;

syncDailyPrices(from, to).catch((err) => {
  console.error(err);
  process.exit(1);
});
