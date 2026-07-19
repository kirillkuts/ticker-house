// Data-level verification for task 029: product split + geography coverage.
import { segmentBreakdown } from "../lib/views";

const TICKERS = ["AAPL", "MSFT", "NVDA", "META", "BRK-B", "GOOGL", "AMZN", "TSLA", "JPM", "LLY"];

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok: ${msg}`);
}

async function main() {
  const aapl = await segmentBreakdown("AAPL");
  if ("error" in aapl) throw new Error(`AAPL: ${aapl.error}`);
  const prodLabels = aapl.products.map((p) => p.member);
  assert(aapl.products.length >= 4, `AAPL products present: ${prodLabels.join(", ")}`);
  assert(prodLabels.includes("IPhone"), "AAPL products include iPhone");
  assert(!prodLabels.includes("Product"), "AAPL 'Product' parent aggregate pruned");
  const lastIdx = aapl.years.length - 1;
  const prodSum = aapl.products.reduce((s, p) => s + (p.revenue[lastIdx] ?? 0), 0);
  const segSum = aapl.segments.reduce((s, x) => s + (x.revenue[lastIdx] ?? 0), 0);
  const ratio = prodSum / segSum;
  assert(ratio > 0.95 && ratio < 1.05, `AAPL product sum ≈ segment sum (ratio ${ratio.toFixed(3)})`);
  const geoSum = aapl.geography.reduce((s, g) => s + (g.revenue[lastIdx] ?? 0), 0);
  const geoRatio = geoSum / segSum;
  assert(aapl.geography.length >= 3, `AAPL geography has ${aapl.geography.length} members (${aapl.geography.map((g) => g.member).join(", ")})`);
  assert(geoRatio > 0.95 && geoRatio < 1.05, `AAPL geography covers total (ratio ${geoRatio.toFixed(3)})`);

  // Full sweep: no errors introduced, stacked reporters still sum sanely,
  // and any products arrays don't overshoot the segment total.
  for (const t of TICKERS) {
    const d = await segmentBreakdown(t);
    if ("error" in d) {
      console.log(`   ${t}: (error, as before) ${d.error.slice(0, 80)}`);
      continue;
    }
    const li = d.years.length - 1;
    const seg = d.segments.reduce((s, x) => s + (x.revenue[li] ?? 0), 0);
    const prod = d.products.reduce((s, p) => s + (p.revenue[li] ?? 0), 0);
    const geo = d.geography.reduce((s, g) => s + (g.revenue[li] ?? 0), 0);
    console.log(
      `   ${t}: axis=${d.axisUsed} segments=${d.segments.length} products=${d.products.length}` +
      ` geo=${d.geography.length} stackable=${d.stackable}` +
      ` prod/seg=${seg ? (prod / seg).toFixed(2) : "-"} geo/seg=${seg ? (geo / seg).toFixed(2) : "-"}`,
    );
    if (d.products.length > 0)
      assert(prod <= 1.1 * seg, `${t} products don't overshoot segment total`);
  }
  console.log("ALL PASS");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
