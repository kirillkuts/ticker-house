// Browser verification for task 026: gate, signup, session, sign out.
import { chromium } from "playwright";

const base = "http://localhost:3000";
const shots = process.argv[2] ?? "/tmp/026";
const email = `ui-${Date.now()}@test.dev`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const ok = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok: ${msg}`);
};

// Logged out → home redirects to /login.
await page.goto(base + "/", { waitUntil: "networkidle" });
ok(page.url().includes("/login"), "home redirects to /login when signed out");
await page.screenshot({ path: `${shots}-login.png` });

// Sign up.
await page.goto(base + "/login?mode=signup", { waitUntil: "networkidle" });
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "hunter2secret");
await page.click('button[type="submit"]');
await page.waitForURL(base + "/", { timeout: 15000 });
ok(true, "signup redirects to home");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shots}-home.png` });

// Dashboard reachable while signed in.
await page.goto(base + "/dashboard", { waitUntil: "networkidle" });
ok(!page.url().includes("/login"), "dashboard reachable signed in");

// Sign out → back to login; home gated again.
await page.click('button[title="Sign out"]');
await page.waitForURL("**/login**", { timeout: 15000 });
ok(true, "sign out lands on /login");
await page.goto(base + "/", { waitUntil: "networkidle" });
ok(page.url().includes("/login"), "home gated again after sign out");

// Wrong password shows error.
await page.goto(base + "/login", { waitUntil: "networkidle" });
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "wrongwrong");
await page.click('button[type="submit"]');
await page.waitForURL("**/login?error=**", { timeout: 15000 });
ok(true, "wrong password shows error");

// Correct login works again.
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "hunter2secret");
await page.click('button[type="submit"]');
await page.waitForURL(base + "/", { timeout: 15000 });
ok(true, "login works for existing account");

await browser.close();
console.log("UI PASS");
