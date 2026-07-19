// Browser verification for task 038: explain popover follow-up chips.
import { chromium } from "playwright";

const base = "http://localhost:3000";
const shot = process.argv[2] ?? "/tmp/038-popover.png";
const email = `sugg-${Date.now()}@test.dev`;
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

// Seeded category chat: canvas with stat tiles, no model roundtrip.
await page.goto(base + "/category/tech", { waitUntil: "networkidle" });
await page.waitForSelector('aside [data-explain="stat tile"]', { timeout: 30000 });

await page.locator('aside [data-explain="stat tile"]').first().click({ modifiers: ["Meta"] });
await page.waitForSelector("[data-explain-popover]", { timeout: 10000 });
await page.waitForFunction(
  () => !document.querySelector("[data-explain-popover]")?.textContent?.includes("Thinking…"),
  { timeout: 60000 },
);
const chips = page.locator("[data-explain-popover] button:not([aria-label])");
const n = await chips.count();
ok(n >= 1 && n <= 2, `${n} suggestion chip(s) under the answer`);
await page.locator("[data-explain-popover]").screenshot({ path: shot });

const chipPrompt = await chips.first().getAttribute("title");
await chips.first().click();
ok((await page.locator("[data-explain-popover]").count()) === 0, "clicking a chip closes the popover");
// The chip's prompt is sent as a user message through the normal chat flow.
const probe = chipPrompt.slice(0, 40);
await page.waitForFunction(
  (needle) => document.body.innerText.includes(needle),
  probe,
  { timeout: 20000 },
);
ok(true, `chip question entered the chat flow ("${probe}…")`);

await browser.close();
console.log("UI PASS");
