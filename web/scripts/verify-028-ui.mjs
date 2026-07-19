// Browser verification for task 028: no stale-view flicker after clicking a
// widget sub-prompt. Requires the dev server AND the trigger worker running.
import { chromium } from "playwright";

const base = "http://localhost:3000";
const email = `flicker-${Date.now()}@test.dev`;
const ok = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok: ${msg}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

// Sign up.
await page.goto(base + "/login?mode=signup", { waitUntil: "networkidle" });
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "hunter2secret");
await page.click('button[type="submit"]');
await page.waitForURL(base + "/", { timeout: 15000 });

// Ask for the overview; wait for the canvas with the Company score section.
await page.fill('input[placeholder="Ask about a stock…"]', "Give me the full overview of NVDA");
await page.click('button:has-text("Ask")');
await page.waitForSelector("aside >> text=Company score", { timeout: 120000 });
ok(true, "overview canvas rendered");
// Let the answer finish so follow-up chips are enabled.
await page.waitForSelector('input[placeholder="Ask about a stock…"]:not([disabled])', { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(2000);

// Click a sub-prompt chip inside the canvas widget.
const chip = page.locator('aside button:has-text("Is it a good company?")').first();
await chip.click();
console.log("clicked sub-prompt chip; sampling canvas for 45s…");

// Sample: once the overview leaves the canvas, it must not come back.
let left = false;
let flicker = false;
const t0 = Date.now();
let settled = false;
while (Date.now() - t0 < 45000) {
  const hasOverview = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    return aside ? aside.innerText.includes("Company score") : false;
  });
  if (left && hasOverview) flicker = true;
  if (!hasOverview) left = true;
  // Settled: the new metrics view is on canvas (a table with tickers or bars).
  if (left && !hasOverview) {
    const done = await page.evaluate(() => {
      const aside = document.querySelector("aside");
      return aside ? /Net margin|Return on equity|Debt \/ equity/i.test(aside.innerText) : false;
    });
    if (done) settled = true;
  }
  await page.waitForTimeout(100);
  if (settled && Date.now() - t0 > 15000) break;
}
ok(left, "canvas switched away from the overview after the chip click");
ok(!flicker, "old overview never flashed back mid-transition");
ok(settled, "new metrics view settled on the canvas");

await browser.close();
console.log("UI PASS");
