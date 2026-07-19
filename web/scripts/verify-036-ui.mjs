// Browser verification for task 036: the category page is a chat entry.
import { chromium } from "playwright";

const base = "http://localhost:3000";
const shots = process.argv[2] ?? "/tmp/036";
const email = `catchat-${Date.now()}@test.dev`;
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

// Homepage tile → category chat, seeded without a model roundtrip.
await page.click('a[href="/category/tech"]');
await page.waitForSelector("aside >> text=Combined market cap", { timeout: 30000 });
ok(true, "category dashboard renders on the canvas");
ok(page.url().includes("/category/tech"), `URL stays canonical (${page.url()})`);
const chatText = await page.evaluate(() => document.body.innerText);
ok(chatText.includes("Show me the Tech category"), "seeded question shows in the chat panel");
ok((await page.locator("aside >> text=Compared on the numbers").count()) === 1, "comparison table on canvas");
await page.screenshot({ path: `${shots}-seeded.png` });

// Drill-down runs in place, answering on the same canvas.
await page.click('aside button:has-text("Margin comparison")');
await page.waitForFunction(
  () => {
    const tabs = [...document.querySelectorAll("aside button")].map((b) => b.textContent ?? "");
    return tabs.some((t) => t.includes("net margin") || t.includes("Compare net margins"));
  },
  { timeout: 120000 },
);
ok(true, "drill-down question answered as a new canvas view in the same chat");
ok(page.url().includes("/category/tech"), "URL still /category/tech after the follow-up");
// The composer is never disabled; the Stop→Ask button cycle marks the end of
// the stream, and the snapshot save fires on ready — give it a beat to land.
await page.waitForSelector('form button:has-text("Stop")', { timeout: 60000 }).catch(() => {});
await page.waitForSelector('form button:has-text("Ask")', { timeout: 120000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${shots}-followup.png` });

// Revisit resumes the same chat (saved under the deterministic id).
await page.goto(base + "/category/tech", { waitUntil: "networkidle" });
await page.waitForSelector("aside >> text=Combined market cap", { timeout: 30000 }).catch(() => {});
const resumed = await page.evaluate(() => document.body.innerText);
ok(resumed.includes("Compare net margins") || resumed.includes("net margin"), "revisit resumes the conversation");

await browser.close();
console.log("UI PASS");
