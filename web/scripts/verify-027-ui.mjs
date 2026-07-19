// Browser verification for task 027: ch theme toggle + system dark regression.
import { chromium } from "playwright";

const base = "http://localhost:3000";
const shots = process.argv[2] ?? "/tmp/027";
const email = `theme-${Date.now()}@test.dev`;
const ok = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok: ${msg}`);
};

const browser = await chromium.launch();

// System dark, no stored choice → data-mode=dark, dark background.
{
  const page = await browser.newPage({ colorScheme: "dark", viewport: { width: 1280, height: 800 } });
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  ok((await page.evaluate(() => document.documentElement.dataset.mode)) === "dark", "system dark → data-mode=dark");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(bg === "rgb(10, 10, 10)", `system dark background is #0a0a0a (got ${bg})`);
  await page.close();
}

const page = await browser.newPage({ colorScheme: "light", viewport: { width: 1280, height: 800 } });

// Sign up to reach the app.
await page.goto(base + "/login?mode=signup", { waitUntil: "networkidle" });
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "hunter2secret");
await page.click('button[type="submit"]');
await page.waitForURL(base + "/", { timeout: 15000 });
ok((await page.evaluate(() => document.documentElement.dataset.mode)) === "light", "system light → data-mode=light");
await page.waitForTimeout(1200);
await page.screenshot({ path: `${shots}-default.png` });

// Toggle to the ch theme.
await page.click('button[title="Try the dark/yellow theme"]');
ok((await page.evaluate(() => document.documentElement.dataset.theme)) === "ch", "toggle sets data-theme=ch");
ok((await page.evaluate(() => document.documentElement.dataset.mode)) === "dark", "ch theme forces dark mode");
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
ok(bg === "rgb(12, 12, 9)", `ch background is #0c0c09 (got ${bg})`);
const askBg = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Ask");
  return btn ? getComputedStyle(btn).backgroundColor : "no-ask";
});
ok(askBg === "rgb(255, 204, 0)", `Ask button is ClickHouse yellow (got ${askBg})`);
await page.waitForTimeout(400);
await page.screenshot({ path: `${shots}-ch-home.png` });

// Persists across reload.
await page.reload({ waitUntil: "networkidle" });
ok((await page.evaluate(() => document.documentElement.dataset.theme)) === "ch", "ch persists across reload");

// Dashboard in ch theme.
await page.goto(base + "/dashboard", { waitUntil: "networkidle" });
await page.screenshot({ path: `${shots}-ch-dashboard.png` });

// Toggle back.
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.click('button[title="Back to the default theme"]');
ok((await page.evaluate(() => document.documentElement.dataset.theme)) === undefined, "toggle back clears data-theme");
ok((await page.evaluate(() => document.documentElement.dataset.mode)) === "light", "back to system (light) mode");

await browser.close();
console.log("UI PASS");
