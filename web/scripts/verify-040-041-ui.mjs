// Browser verification: 040 (expense legend explain) + 041 (score row explain).
import { chromium } from "playwright";

const base = "http://localhost:3000";
const shot = process.argv[2] ?? "/tmp/041-score.png";
const email = `leg2-${Date.now()}@test.dev`;
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

// 040: expense breakdown legend.
await page.fill('input[placeholder="Ask about a stock…"]', "Where does ANET spend its money?");
await page.click('button:has-text("Ask")');
await page.waitForSelector('aside [data-explain="legend entry"]', { timeout: 120000 });
await page.locator('aside [data-explain="legend entry"]').first().click({ modifiers: ["Meta"] });
await page.waitForSelector("[data-explain-popover]", { timeout: 10000 });
ok(true, "expense legend entry opens the explain popover");
await page.waitForFunction(
  () => !document.querySelector("[data-explain-popover]")?.textContent?.includes("Thinking…"),
  { timeout: 60000 },
);
const t1 = await page.locator("[data-explain-popover]").innerText();
ok(t1.length > 40, `expense answer present: "${t1.replace(/\s+/g, " ").slice(0, 70)}…"`);
await page.keyboard.press("Escape");

// 041: company score rows on the overview.
await page.waitForSelector('form button:has-text("Ask")', { timeout: 60000 });
await page.fill('input[placeholder="Ask about a stock…"]', "Give me the full overview of NVDA");
await page.click('button:has-text("Ask")');
await page.waitForSelector('aside [data-explain="company score"]', { timeout: 120000 });
const scoreRow = page.locator('aside [data-explain="company score"]', { hasText: "Value" }).first();
await scoreRow.click({ modifiers: ["Meta"] });
await page.waitForSelector("[data-explain-popover]", { timeout: 10000 });
ok(true, "score row opens the explain popover");
await page.waitForFunction(
  () => !document.querySelector("[data-explain-popover]")?.textContent?.includes("Thinking…"),
  { timeout: 60000 },
);
const t2 = await page.locator("[data-explain-popover]").innerText();
ok(/value|p\/e|peer|score/i.test(t2), `score answer is grounded: "${t2.replace(/\s+/g, " ").slice(0, 80)}…"`);
ok(/company score/i.test(t2), "popover kicker names the element kind");
await page.locator("[data-explain-popover]").screenshot({ path: shot });

await browser.close();
console.log("UI PASS");
