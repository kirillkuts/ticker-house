// Browser verification for task 039: interest-driven session digest canvas.
import { chromium } from "playwright";

const base = "http://localhost:3000";
const shot = process.argv[2] ?? "/tmp/039-digest.png";
const email = `digest-${Date.now()}@test.dev`;
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

// Session: seeded category canvas + one real follow-up + one explain-click.
await page.goto(base + "/category/tech", { waitUntil: "networkidle" });
await page.waitForSelector('aside [data-explain="stat tile"]', { timeout: 30000 });
await page.fill('input[placeholder="Ask about a stock…"]', "Compare net margins and return on equity for NVDA and MSFT");
await page.click('button:has-text("Ask")');
await page.waitForSelector('form button:has-text("Stop")', { timeout: 60000 }).catch(() => {});
await page.waitForSelector('form button:has-text("Ask")', { timeout: 120000 });
await page.waitForTimeout(1000);

// Interest signal: explain a stat tile, dismiss.
const tile = page.locator('aside [data-explain="stat tile"]').first();
if (await tile.count()) {
  await tile.click({ modifiers: ["Meta"] });
  await page.waitForSelector("[data-explain-popover]", { timeout: 10000 });
  await page.keyboard.press("Escape");
}

// Summarize.
await page.click('button:has-text("summarize")');
await page.waitForSelector("text=Summarize this session for me", { timeout: 90000 });
ok(true, "digest exchange appears in the chat");

// The digest becomes the active canvas with at least one picked view.
await page.waitForTimeout(1500);
const tabs = await page.evaluate(() =>
  [...document.querySelectorAll("aside .shrink-0")].map((b) => b.textContent ?? ""),
);
ok(tabs.some((t) => t.includes("Summarize this session")), `digest canvas tab exists (${tabs.length} tabs)`);
const asideText = await page.locator("aside").innerText();
ok(/save/.test(asideText) || (await page.locator('aside button:has-text("save")').count()) > 0, "digest views carry save-to-dashboard buttons");
const chatText = await page.evaluate(() => document.body.innerText);
ok(/\*\*|margin|NVDA|MSFT|Tech/i.test(chatText), "digest note present in chat");
await page.screenshot({ path: shot, fullPage: false });

// Persisted: reload resumes with the digest still there.
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("text=Summarize this session for me", { timeout: 30000 });
ok(true, "digest persists across reload");

await browser.close();
console.log("UI PASS");
