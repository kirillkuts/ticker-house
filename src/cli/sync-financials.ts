import "dotenv/config";
import { syncFinancials } from "../lib/sync-financials.js";

syncFinancials().catch((err) => {
  console.error(err);
  process.exit(1);
});
