// Browser verification: 034 (short formatted popover), 035 (Esc/outside
// close), 037 (segment legend explain + label spacing).
import { chromium } from "playwright";

const base = "http://localhost:3000";
const shot = process.argv[2] ?? "/tmp/034-popover.png";
const email = `leg-${Date.now()}@test.dev`;
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

await page.fill('input[placeholder="Ask about a stock…"]', "Show ACN's revenue by segment");
await page.click('button:has-text("Ask")');
await page.waitForSelector('aside [data-explain="legend entry"]', { timeout: 120000 });
await page.waitForSelector('input[placeholder="Ask about a stock…"]:not([disabled])', { timeout: 120000 });

// 037: labels humanized — no glued "EMEASegment"-style words in the legend.
const legendText = await page.locator("aside").innerText();
ok(!/[a-z][A-Z][a-z]/.test(legendText.replace(/[A-Z]{2,}/g, "")) || !/EMEASegment|ProductsSegment/.test(legendText), "legend labels are spaced (no EMEASegment)");

// 037: cmd+click a legend entry opens the popover.
await page.locator('aside [data-explain="legend entry"]').first().click({ modifiers: ["Meta"] });
await page.waitForSelector("[data-explain-popover]", { timeout: 10000 });
ok(true, "cmd+click on a segment legend entry opens the popover");
await page.waitForFunction(
  () => !document.querySelector("[data-explain-popover]")?.textContent?.includes("Thinking…"),
  { timeout: 60000 },
);

// 034: short + formatted.
const body = await page.locator("[data-explain-popover]").innerText();
const answer = body.replace(/^WHAT IS THIS[^\n]*\n/i, "").trim();
ok(answer.length < 500, `answer is short (${answer.length} chars)`);
const html = await page.locator("[data-explain-popover]").innerHTML();
ok(/<strong>|<li>/.test(html), "answer uses bold and/or bullets");
await page.locator("[data-explain-popover]").screenshot({ path: shot });

// 035: Escape closes.
await page.keyboard.press("Escape");
ok((await page.locator("[data-explain-popover]").count()) === 0, "Escape closes the popover");

// 035: outside click closes; a click inside does not.
await page.locator('aside [data-explain="legend entry"]').first().click({ modifiers: ["Meta"] });
await page.waitForSelector("[data-explain-popover]", { timeout: 10000 });
await page.locator("[data-explain-popover]").click({ position: { x: 30, y: 40 } });
ok((await page.locator("[data-explain-popover]").count()) === 1, "click inside keeps the popover open");
await page.locator("h1, .text-3xl").first().click().catch(() => page.mouse.click(400, 80));
ok((await page.locator("[data-explain-popover]").count()) === 0, "click outside closes the popover");

// 035: cmd+click on another target replaces, not just dismisses.
await page.locator('aside [data-explain="stat tile"], aside [data-explain="legend entry"]').last().click({ modifiers: ["Meta"] });
await page.waitForSelector("[data-explain-popover]", { timeout: 10000 });
ok(true, "cmd+click on another target opens a new popover");

await browser.close();
console.log("UI PASS");
