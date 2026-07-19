import "dotenv/config";
import { syncSegments } from "../lib/sync-segments.js";

const arg = process.argv.find((a) => a.startsWith("--quarters="));
const quartersBack = arg ? Number(arg.split("=")[1]) : 12;

syncSegments(quartersBack).catch((err) => {
  console.error(err);
  process.exit(1);
});
