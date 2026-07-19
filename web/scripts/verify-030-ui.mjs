// Browser verification for task 030: homepage sort control (A–Z / Top revenue).
import { chromium } from "playwright";

const base = "http://localhost:3000";
const shot = process.argv[2] ?? "/tmp/030-sort.png";
const email = `sort-${Date.now()}@test.dev`;
const ok = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok: ${msg}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(base + "/login?mode=signup", { waitUntil: "networkidle" });
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "hunter2secret");
await page.click('button[type="submit"]');
await page.waitForURL(base + "/", { timeout: 15000 });
await page.waitForSelector("text=Covered companies", { timeout: 30000 });

const tickers = async () =>
  page.$$eval("div.grid button span.font-semibold.whitespace-nowrap", (els) => els.map((e) => e.textContent));

// Default: A–Z.
const azOrder = await tickers();
ok(JSON.stringify(azOrder) === JSON.stringify([...azOrder].sort()), `default order is A–Z: ${azOrder.join(" ")}`);

// Switch to Top revenue: AMZN ($ largest TTM revenue of the 10) should lead.
await page.click('button:has-text("Top revenue")');
await page.waitForTimeout(300);
const revOrder = await tickers();
ok(JSON.stringify(revOrder) !== JSON.stringify(azOrder), "order changed after selecting Top revenue");
ok(revOrder[0] === "AMZN" || revOrder[0] === "WMT", `revenue leader first (${revOrder[0]}): ${revOrder.join(" ")}`);
await page.screenshot({ path: shot });

// Persists across reload.
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("text=Covered companies", { timeout: 30000 });
const afterReload = await tickers();
ok(JSON.stringify(afterReload) === JSON.stringify(revOrder), "Top revenue persists across reload");

// Back to A–Z.
await page.click('button:has-text("A–Z")');
await page.waitForTimeout(300);
const back = await tickers();
ok(JSON.stringify(back) === JSON.stringify([...back].sort()), "A–Z restores alphabetical order");

await browser.close();
console.log("UI PASS");
