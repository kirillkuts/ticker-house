import "dotenv/config";
import { syncSecurities } from "../lib/sync-securities.js";

syncSecurities().catch((err) => {
  console.error(err);
  process.exit(1);
});
