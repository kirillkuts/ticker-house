// Data-level verification for task 031: category mapping coverage + snapshot.
import { homeSnapshot, categorySnapshot } from "../lib/views";
import { CATEGORIES, categorySlugOf } from "../lib/categories";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok: ${msg}`);
}

async function main() {
  const home = await homeSnapshot();
  assert(home.length > 50, `${home.length} covered companies loaded`);

  const unmapped = home.filter((t) => categorySlugOf(t.ticker, t.industry) === null);
  assert(
    unmapped.length === 0,
    `every covered company maps to a category${unmapped.length ? ` (unmapped: ${unmapped.map((t) => `${t.ticker}:"${t.industry}"`).join(", ")})` : ""}`,
  );

  for (const c of CATEGORIES) {
    const members = home.filter((t) => categorySlugOf(t.ticker, t.industry) === c.slug);
    console.log(`   ${c.slug}: ${members.length} — ${members.map((m) => m.ticker).join(" ")}`);
    assert(members.length >= 2, `${c.slug} has at least 2 members`);
  }

  const tech = await categorySnapshot("tech");
  assert(tech !== null, "tech snapshot loads");
  assert(tech!.aggregates.marketCapTotal! > 1e12, "tech combined market cap > $1T");
  assert(tech!.aggregates.revenueLeaders.length === 3, `tech revenue leaders: ${tech!.aggregates.revenueLeaders.map((l) => l.ticker).join(", ")}`);
  assert(tech!.metrics !== null && tech!.metrics.rows.length === tech!.members.length, "comparison metrics cover all members");

  assert((await categorySnapshot("nope")) === null, "unknown slug returns null");
  console.log("ALL PASS");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
