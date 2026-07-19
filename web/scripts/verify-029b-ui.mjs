// Browser verification for the fact-anchor dots (task 029, pulsing dots).
import { chromium } from "playwright";

const base = "http://localhost:3000";
const shot = process.argv[2] ?? "/tmp/029b-dots.png";
const email = `dots-${Date.now()}@test.dev`;
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

await page.fill(
  'input[placeholder="Ask about a stock…"]',
  "Show GOOGL's annual fundamentals and explain how revenue, net margin, EPS and free cash flow changed over the years",
);
await page.click('button:has-text("Ask")');
await page.waitForSelector("aside >> text=Diluted EPS", { timeout: 120000 });
ok(true, "fundamentals table rendered on canvas");

// Dots arrive with the model's highlight_facts call, after the text.
await page.waitForSelector("aside table span.animate-ping", { timeout: 120000 });
const dots = await page.locator("aside table span.animate-ping").count();
ok(dots >= 2, `${dots} fact dots rendered in the table`);

// Hover the first dot: the explanation snippet appears as a tooltip.
const dot = page.locator("aside table span.cursor-help").first();
await dot.hover();
await page.waitForTimeout(300);
const tipText = await page.evaluate(() => {
  const tips = [...document.querySelectorAll("aside span.fixed")];
  return tips.map((t) => t.textContent).join(" ");
});
ok(tipText.trim().length > 10, `tooltip shows snippet: "${tipText.slice(0, 80)}…"`);

await page.locator("aside").screenshot({ path: shot });
await browser.close();
console.log("UI PASS");
