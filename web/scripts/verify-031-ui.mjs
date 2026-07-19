// Browser verification for task 031: category tiles + category page.
import { chromium } from "playwright";

const base = "http://localhost:3000";
const shots = process.argv[2] ?? "/tmp/031";
const email = `cat-${Date.now()}@test.dev`;
const ok = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok: ${msg}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

await page.goto(base + "/login?mode=signup", { waitUntil: "networkidle" });
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "hunter2secret");
await page.click('button[type="submit"]');
await page.waitForURL(base + "/", { timeout: 15000 });

await page.waitForSelector("text=Browse by category", { timeout: 30000 });
ok(true, "homepage shows category tiles");
await page.screenshot({ path: `${shots}-home.png` });

await page.click('a[href="/category/tech"]');
await page.waitForURL("**/category/tech", { timeout: 15000 });
await page.waitForSelector("text=Combined market cap", { timeout: 30000 });
ok(true, "tech category page renders aggregates");
const text = await page.evaluate(() => document.body.innerText);
ok(text.includes("Revenue leaders"), "revenue leaders tile present");
ok(text.includes("Compared on the numbers"), "comparison section present");
ok(/NVDA/.test(text) && /MSFT/.test(text), "member cards present (NVDA, MSFT)");
ok(text.includes("P/E (TTM)") && text.includes("Net margin"), "metric comparison columns present");
await page.screenshot({ path: `${shots}-tech.png`, fullPage: true });

// Member card opens the company overview chat flow via /?ask=…
await page.click('div.grid button:has(span:text-is("NVDA"))');
await page.waitForURL("**/?ask=**", { timeout: 15000 });
ok(true, "company card routes to the chat with the overview question");

// Unknown slug 404s.
const resp = await page.goto(base + "/category/does-not-exist", { waitUntil: "networkidle" });
ok(resp.status() === 404, `unknown category returns 404 (got ${resp.status()})`);

await browser.close();
console.log("UI PASS");
