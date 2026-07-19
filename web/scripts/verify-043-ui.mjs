// Browser verification for task 043: multiple named dashboards.
import { chromium } from "playwright";

const base = "http://localhost:3000";
const shot = process.argv[2] ?? "/tmp/043-dash.png";
const email = `dash-${Date.now()}@test.dev`;
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

// Seeded category canvas → save its widget via the picker.
await page.goto(base + "/category/tech", { waitUntil: "networkidle" });
await page.waitForSelector("aside >> text=Combined market cap", { timeout: 30000 });
await page.hover("aside .chip-in");
await page.click('aside button:has-text("☆ save")');
await page.waitForSelector("[data-save-menu]", { timeout: 10000 });
ok(true, "save picker opens");
const newEntry = await page.locator("[data-save-menu] button").first().innerText();
ok(newEntry.includes("·"), `session dashboard offer: "${newEntry.replace(/\n/g, " ")}"`);
await page.locator("[data-save-menu] button").first().click();
await page.waitForSelector('aside button:has-text("✓ saved")', { timeout: 15000 });
ok(true, "widget saved to the new session dashboard");

// Second view in the same session defaults to the same dashboard.
await page.fill('input[placeholder="Ask about a stock…"]', "Compare P/E and net margin for NVDA and MSFT");
await page.click('button:has-text("Ask")');
await page.waitForSelector('form button:has-text("Stop")', { timeout: 60000 }).catch(() => {});
await page.waitForSelector('form button:has-text("Ask")', { timeout: 120000 });
await page.waitForTimeout(1500);
await page.hover("aside .chip-in");
await page.click('aside button:has-text("☆ save")');
await page.waitForSelector("[data-save-menu]", { timeout: 10000 });
const first = await page.locator("[data-save-menu] button").first().innerText();
ok(first.includes("this session"), `second save defaults to the session dashboard ("${first.replace(/\n/g, " ").trim()}")`);
await page.locator("[data-save-menu] button").first().click();
await page.waitForTimeout(1500);

// Dashboard page: named tab with both widgets.
await page.goto(base + "/dashboard", { waitUntil: "networkidle" });
const tab = await page.locator("h1").innerText();
ok(tab.includes("·"), `dashboard is auto-named ("${tab}")`);
ok((await page.evaluate(() => document.body.innerText)).includes("(2)"), "tab shows 2 widgets");
await page.screenshot({ path: shot });

// Rename.
await page.click('button[aria-label^="Rename"]');
await page.waitForSelector('input[aria-label="Dashboard name"]', { timeout: 10000 });
await page.fill('input[aria-label="Dashboard name"]', "My tech board");
await page.keyboard.press("Enter");
await page.waitForTimeout(1500);
await page.reload({ waitUntil: "networkidle" });
ok((await page.locator("h1").innerText()) === "My tech board", "rename sticks");

// Delete.
page.on("dialog", (d) => d.accept());
await page.click('button[aria-label^="Delete"]');
await page.waitForURL("**/dashboard", { timeout: 15000 });
await page.waitForTimeout(1500);
const after = await page.evaluate(() => document.body.innerText);
ok(after.includes("Nothing saved yet"), "delete removes the dashboard and its widgets");

await browser.close();
console.log("UI PASS");
