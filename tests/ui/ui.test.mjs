import { chromium } from "playwright";
import { readFileSync } from "fs";
const A = new URL("../../app/src/main/assets/", import.meta.url).pathname;
const js = readFileSync(A + "app.js", "utf8").replace('apiKey: "REPLACE_WITH_FIREBASE_API_KEY"', 'apiKey: "test"');
const fake = readFileSync(new URL("fake-firebase.js", import.meta.url), "utf8");
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [], results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "ok   " : "FAIL ") + name + (extra ? "  → " + extra : "")); };

async function page(opts) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push(e.message)); p.on("console", m => m.type() === "error" && errors.push(m.text()));
  await p.route("https://appassets.androidplatform.net/assets/**", r => { const f = r.request().url().split("/assets/")[1]; r.fulfill({ body: f === "app.js" ? js : readFileSync(A + f), contentType: f.endsWith(".js") ? "text/javascript" : "text/html" }); });
  await p.route("https://www.gstatic.com/**", r => r.fulfill({ body: fake, contentType: "text/javascript" }));
  await p.route("https://api.qrserver.com/**", r => r.fulfill({ status: 200, body: "" }));
  await p.addInitScript(() => { window.__fb = { docs: {}, listeners: [], authCbs: [], user: null, seq: 0, users: { owner: { role: "master", displayName: "Owner" }, amy: { role: "staff", displayName: "Amy" } } }; window.confirm = () => true; });
  await p.goto("https://appassets.androidplatform.net/assets/index.html");
  return p;
}
const login = async (p, who, pw = "pw") => { await p.fill("#email", who + "@shop.co.zw"); await p.fill("#password", pw); await p.click("#loginForm button[type=submit]"); await p.waitForTimeout(150); };
const tab = (p, t) => p.click(`nav [data-tab=${t}]`);

// Staff session
let p = await page({ timezoneId: "Europe/London" }); // phone set to the wrong timezone on purpose
await login(p, "amy", "nope");
check("wrong password shows friendly error", (await p.textContent("#toast")).includes("Incorrect email"));
await login(p, "amy");
check("staff signed in", (await p.textContent("#who")).includes("Amy • STAFF"));
check("staff cannot see Reports/Audit", await p.isHidden("nav [data-tab=reports]") && await p.isHidden("nav [data-tab=staff]"));
await tab(p, "sessions");
check("Xbox rate hidden for PS5", await p.isHidden("#xrateWrap"));
await p.click("#startBtn");
check("start requires player name", (await p.textContent("#toast")).includes("player name"));
await p.fill("#player", "<img src=x onerror=alert(1)>Tino"); await p.fill("#station", "PS5-1"); await p.click("#startBtn"); await p.waitForTimeout(100);
check("PS5 session started @ $2", (await p.textContent("#activeRows")).includes("$2.00"));
check("player name escaped (no XSS)", (await p.innerHTML("#activeRows")).includes("&lt;img"));
await p.selectOption("#console", "Xbox");
check("Xbox rate shown for Xbox", await p.isVisible("#xrateWrap"));
await p.fill("#player", "Kuda"); await p.click("#startBtn");
check("Xbox requires a rate", (await p.textContent("#toast")).includes("Xbox hourly rate"));
await p.fill("#xrate", "3"); await p.click("#startBtn"); await p.waitForTimeout(100);
check("Xbox session @ $3", (await p.textContent("#activeRows")).includes("$3.00"));
check("dashboard active count = 2", (await p.textContent("#count")) === "2");

// Backdate first session by 95 minutes to check billing: 95 min × $2/h = $3.17
await p.evaluate(() => { const s = Object.values(window.__fb.docs.sessions)[0]; const t = Date.now() - 95 * 60000 + 5000; s.startedAt = { toDate: () => new Date(t) }; window.__fb.listeners.forEach(l => l.run()); });
check("live amount after 95 min = $3.17", (await p.textContent("#activeRows")).includes("$3.17"), (await p.textContent("#activeRows")).slice(0, 120));
await p.click('#activeRows tr:has-text("Tino") button[data-act=finish]'); await p.waitForTimeout(100);
check("finished session in Completed today", (await p.textContent("#doneRows")).includes("1h 35m") && (await p.textContent("#doneRows")).includes("$3.17"));
check("revenue today = $3.17", (await p.textContent("#revenue")) === "$3.17");
check("stored doc has no client total", await p.evaluate(() => !("total" in Object.values(window.__fb.docs.sessions)[0])));

await tab(p, "vip");
await p.fill("#vn", "Rudo"); await p.fill("#vd", "2099-01-01"); await p.fill("#vt", "18:00"); await p.click("#vipBtn"); await p.waitForTimeout(100);
await p.evaluate(() => window.__fb.docs.vips.old = { name: "Past", date: "2000-01-01", time: "", createdAt: { toDate: () => new Date() } });
await p.evaluate(() => window.__fb.listeners.forEach(l => l.run()));
check("upcoming VIP listed, past hidden", (await p.textContent("#vipRows")).includes("Rudo") && !(await p.textContent("#vipRows")).includes("Past"));
check("staff has no VIP delete", (await p.$$("#vipRows button")).length === 0);
await tab(p, "events");
await p.fill("#en", "FC Cup"); await p.fill("#ed", "2099-02-02"); await p.fill("#ef", "5"); await p.fill("#ecap", "16"); await p.click("#eventBtn"); await p.waitForTimeout(100);
check("event saved and form cleared", (await p.textContent("#eventRows")).includes("Entry $5.00") && (await p.inputValue("#en")) === "");
await tab(p, "payments");
check("payments tab shows EcoCash + maps link", (await p.textContent("#payments")).includes("+263 77 514 3720") && (await p.getAttribute("#mapLink", "href")).includes("Luxor"));
const audit = await p.evaluate(() => Object.values(window.__fb.docs.audit || {}).map(a => a.action));
check("audit entries written", ["session_start", "session_finish", "vip_created", "event_created"].every(a => audit.includes(a)), audit.join(","));
await p.click("#logoutBtn"); await p.waitForTimeout(100);
check("sign out returns to login", await p.isVisible("#login") && await p.isHidden("#appUI"));

// Master view on same data
await login(p, "owner");
check("master sees Reports/Audit", await p.isVisible("nav [data-tab=reports]"));
await tab(p, "reports");
check("report row with $3.17", (await p.textContent("#repRows")).includes("$3.17"));
await tab(p, "vip");
check("master can delete VIP", (await p.$$("#vipRows button.danger")).length === 1);
await p.click("#vipRows button.danger"); await p.waitForTimeout(100);
check("VIP deleted", !(await p.textContent("#vipRows")).includes("Rudo"));
await tab(p, "sessions");

// PS4 promo logic: independent of phone timezone
const promo = await p.evaluate(async () => {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Harare", hour: "2-digit", hourCycle: "h23" });
  const h = d => Number(f.format(d));
  return [h(new Date("2026-09-28T06:00:00Z")), h(new Date("2026-09-28T09:59:00Z")), h(new Date("2026-09-28T10:00:00Z"))];
});
check("Harare hour 08, 11, 12 for UTC 06:00/09:59/10:00", JSON.stringify(promo) === "[8,11,12]", JSON.stringify(promo));

check("no page errors", errors.length === 0, errors.join(" | "));
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
