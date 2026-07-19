// Browser verification for task 029: AAPL segments view shows product lines.
import { chromium } from "playwright";

const base = "http://localhost:3000";
const shot = process.argv[2] ?? "/tmp/029-aapl-segments.png";
const email = `seg-${Date.now()}@test.dev`;
const ok = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok: ${msg}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

await page.goto(base + "/login?mode=signup", { waitUntil: "networkidle" });
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "hunter2secret");
await page.click('button[type="submit"]');
await page.waitForURL(base + "/", { timeout: 15000 });

await page.fill('input[placeholder="Ask about a stock…"]', "Show AAPL's revenue by segment and explain where the money comes from");
await page.click('button:has-text("Ask")');
await page.waitForSelector("aside >> text=Revenue by product & service line", { timeout: 120000 });
ok(true, "product & service section rendered on canvas");

const text = await page.evaluate(() => document.querySelector("aside")?.innerText ?? "");
ok(text.includes("IPhone") || text.includes("iPhone"), "iPhone series present");
ok(text.includes("Service"), "Services series present");
ok(text.includes("Mac"), "Mac series present");
ok(/US|United States/.test(text) && /CN|China/.test(text), "geography shows US and China again");

await page.waitForTimeout(1500);
const aside = page.locator("aside");
await aside.screenshot({ path: shot });
await browser.close();
console.log("UI PASS");
