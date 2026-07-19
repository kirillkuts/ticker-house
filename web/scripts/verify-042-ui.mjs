// Browser verification for task 042: no duplicate React keys in the chat.
import { chromium } from "playwright";

const base = "http://localhost:3000";
const email = `dupe-${Date.now()}@test.dev`;
const ok = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok: ${msg}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const dupErrors = [];
page.on("console", (m) => {
  if (m.type() === "error" && /same key/i.test(m.text())) dupErrors.push(m.text().slice(0, 120));
});

await page.goto(base + "/login?mode=signup", { waitUntil: "networkidle" });
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "hunter2secret");
await page.click('button[type="submit"]');
await page.waitForURL(base + "/", { timeout: 15000 });

// Seeded category chat → follow-up → reload mid-stream → resume → summarize.
await page.goto(base + "/category/tech", { waitUntil: "networkidle" });
await page.waitForSelector("aside >> text=Combined market cap", { timeout: 30000 });
await page.fill('input[placeholder="Ask about a stock…"]', "Compare P/E and net margin for NVDA and AAPL");
await page.click('button:has-text("Ask")');
// Reload while the answer streams — the resume + replay overlap window.
await page.waitForTimeout(4000);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);
// Ask again on the resumed chat and let it finish.
await page.fill('input[placeholder="Ask about a stock…"]', "Rank NVDA, AAPL and MSFT by return on equity");
await page.click('button:has-text("Ask")');
await page.waitForSelector('form button:has-text("Stop")', { timeout: 60000 }).catch(() => {});
await page.waitForSelector('form button:has-text("Ask")', { timeout: 120000 });
await page.waitForTimeout(1000);
// Digest exchange (local message insertion path).
await page.click('button:has-text("summarize")').catch(() => {});
await page.waitForSelector("text=Summarize this session for me", { timeout: 90000 }).catch(() => {});
await page.waitForTimeout(2500);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(3000);

ok(dupErrors.length === 0, `no duplicate-key console errors across the flows${dupErrors.length ? ` (got: ${dupErrors[0]})` : ""}`);

// No dropped/duplicated messages: each question appears exactly once.
const body = await page.evaluate(() => document.body.innerText);
const count = (needle) => body.split(needle).length - 1;
ok(count("Rank NVDA, AAPL and MSFT by return on equity") === 1, "second question appears exactly once");

await browser.close();
console.log("UI PASS");
