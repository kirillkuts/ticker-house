// Browser verification for tasks 032 (explain popover, not chat) and 033
// (cmd+click on a metrics chart title). Needs dev server + trigger worker.
import { chromium } from "playwright";

const base = "http://localhost:3000";
const shots = process.argv[2] ?? "/tmp/032";
const email = `pop-${Date.now()}@test.dev`;
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

// One canvas view to poke at.
await page.fill('input[placeholder="Ask about a stock…"]', "Give me the full overview of NVDA");
await page.click('button:has-text("Ask")');
await page.waitForSelector("aside >> text=Company score", { timeout: 120000 });
// Let the whole answer (text + follow-ups) finish before counting messages.
await page.waitForSelector('input[placeholder="Ask about a stock…"]:not([disabled])', { timeout: 120000 });
await page.waitForTimeout(2000);
const userMsgCount = async () => page.locator('div.uppercase:text-is("you")').count();
const before = await userMsgCount();
ok(before >= 1, `user message counter sees ${before} message(s)`);

// 032: cmd+click a stat tile → popover, not a chat message.
await page.locator('aside [data-explain="stat tile"]').first().click({ modifiers: ["Meta"] });
await page.waitForSelector("[data-explain-popover]", { timeout: 10000 });
ok(true, "popover appears after cmd+click on a stat tile");
await page.waitForFunction(
  () => !document.querySelector("[data-explain-popover]")?.textContent?.includes("Thinking…"),
  { timeout: 60000 },
);
const popText = await page.locator("[data-explain-popover]").innerText();
ok(popText.length > 60, `popover carries an answer: "${popText.slice(0, 70).replace(/\n/g, " ")}…"`);
ok((await userMsgCount()) === before, "no new message entered the chat thread");
await page.locator("aside").screenshot({ path: `${shots}-popover.png` });

// Close it.
await page.click('[data-explain-popover] button[aria-label="Dismiss explanation"]');
ok((await page.locator("[data-explain-popover]").count()) === 0, "X dismisses the popover");

// 033: the metrics chart title now explains itself too. Click while the
// answer may still be streaming — the fixed popover must survive the
// canvas switching underneath it.
await page.fill('input[placeholder="Ask about a stock…"]', "Compare P/E, net margin and return on equity for GOOGL and MSFT");
await page.click('button:has-text("Ask")');
await page.waitForSelector('aside span[data-explain="metric"]:has-text("Return on equity")', { timeout: 120000 });
await page.locator('aside span[data-explain="metric"]:has-text("Return on equity")').first().click({ modifiers: ["Meta"] });
await page.waitForSelector("[data-explain-popover]", { timeout: 10000 });
ok(true, "cmd+click on the metric chart title opens the popover (033)");
await page.waitForFunction(
  () => !document.querySelector("[data-explain-popover]")?.textContent?.includes("Thinking…"),
  { timeout: 60000 },
);
const t2 = await page.locator("[data-explain-popover]").innerText();
ok(/equity|roe|return/i.test(t2), `metric label answer is about ROE: "${t2.slice(0, 70).replace(/\n/g, " ")}…"`);
await page.locator("aside").screenshot({ path: `${shots}-metric-title.png` });

await browser.close();
console.log("UI PASS");
