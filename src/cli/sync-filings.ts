import "dotenv/config";
import { syncFilings } from "../lib/sync-filings.js";

const arg = process.argv.find((a) => a.startsWith("--days="));
const textDays = arg ? Number(arg.split("=")[1]) : 90;

syncFilings(textDays).catch((err) => {
  console.error(err);
  process.exit(1);
});
