/**
 * SimplyBook timetable diagnostic.
 *
 *   node scripts/sb-timetable-check.mjs 2026-07-31
 *
 * Reads .env.local, authenticates exactly the way src/lib/simplybook.ts does,
 * and prints what /admin/timeline/slots actually returns for one date — the
 * thing the app's sync silently swallows errors from.
 *
 * Three possible outcomes, and they point at three different fixes:
 *   A) auth or endpoint errors        -> credentials / permissions
 *   B) returns the 2 real classes     -> the fetch works, pruning is the bug
 *   C) returns 5+ slots per service   -> the endpoint is expanding working
 *                                        hours into fake slots
 */

import fs from "node:fs";
import path from "node:path";

const DATE = process.argv[2];
if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) {
  console.error("Usage: node scripts/sb-timetable-check.mjs YYYY-MM-DD");
  process.exit(1);
}

/* ---- env ---- */
const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("No .env.local found in", process.cwd());
  process.exit(1);
}
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const BASE = env.SIMPLYBOOK_API_BASE || "https://user-api-v2.simplybook.it";
const company = env.SIMPLYBOOK_COMPANY;
const login = env.SIMPLYBOOK_LOGIN;
const key = env.SIMPLYBOOK_USER_KEY;

if (!company || !login || !key) {
  console.error("Missing SIMPLYBOOK_COMPANY / SIMPLYBOOK_LOGIN / SIMPLYBOOK_USER_KEY in .env.local");
  process.exit(1);
}
console.log(`company=${company}  login=${login}  base=${BASE}`);

/* ---- auth ---- */
let token;
try {
  const res = await fetch(`${BASE}/admin/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company, login, password: key }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${body.slice(0, 200)}`);
  token = JSON.parse(body).token;
  console.log("AUTH  ok\n");
} catch (e) {
  console.error("AUTH  FAILED —", e.message);
  console.error("      -> outcome A: credentials or permissions. Nothing else can work.");
  process.exit(1);
}

const get = async (p) => {
  const res = await fetch(`${BASE}${p}`, {
    headers: { "X-Company-Login": company, "X-Token": token, "Content-Type": "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
};

/* ---- services + providers ---- */
const svcRaw = await get("/admin/services?page=1&on_page=100");
const services = Array.isArray(svcRaw) ? svcRaw : svcRaw.data ?? [];
const provRaw = await get("/admin/providers?page=1&on_page=100").catch(() => []);
const providers = Array.isArray(provRaw) ? provRaw : provRaw.data ?? [];

const active = services.filter((s) => s.is_active !== false);
console.log(`SERVICES  ${services.length} total, ${active.length} active`);
console.log(`PROVIDERS ${providers.length}`);
const combos = active.reduce((n, s) => n + Math.max(1, (s.providers ?? []).length), 0);
console.log(`COMBOS    ${combos} service/provider pairs  ${combos > 60 ? "<-- OVER the old 60-call budget" : ""}\n`);

/* ---- the actual timetable call, per service ---- */
let totalSlots = 0;
let failures = 0;
const rows = [];

for (const svc of active) {
  const pids = (svc.providers ?? []).length ? svc.providers : [undefined];
  for (const pid of pids) {
    const q = new URLSearchParams({
      service_id: String(svc.id),
      date_from: DATE,
      date_to: DATE,
      count: "1",
      skip_min_max_restriction: "0",
    });
    if (pid) q.set("provider_id", String(pid));

    try {
      const days = await get(`/admin/timeline/slots?${q.toString()}`);
      const slots = (days ?? []).flatMap((d) => (d.slots ?? []).map((s) => s.time));
      totalSlots += slots.length;
      if (slots.length) {
        const prov = providers.find((p) => Number(p.id) === Number(pid));
        rows.push({
          service: svc.name,
          provider: prov?.name ?? (pid ? `#${pid}` : "—"),
          times: slots.join(" "),
        });
      }
    } catch (e) {
      failures++;
      rows.push({ service: svc.name, provider: pid ? `#${pid}` : "—", times: `ERROR ${e.message.slice(0, 80)}` });
    }
  }
}

console.log(`TIMETABLE for ${DATE}: ${totalSlots} slots, ${failures} failed calls\n`);
for (const r of rows) {
  console.log(`  ${String(r.service).slice(0, 28).padEnd(28)} ${String(r.provider).slice(0, 14).padEnd(14)} ${r.times}`);
}

console.log("\n---");
if (failures === rows.length && rows.length > 0) {
  console.log("Outcome A: every timetable call failed. The app swallows this, which is why");
  console.log("no new classes appear and nothing is ever pruned.");
} else if (totalSlots === 0) {
  console.log("Outcome A: endpoint works but returns nothing. Either the wrong endpoint for");
  console.log("this account's setup, or the schedule lives somewhere else (classes/events).");
} else {
  console.log("Compare the times above against SimplyBook's own page for this date.");
  console.log("  match      -> the fetch is fine; the app is failing to prune stale rows.");
  console.log("  app has extra times -> those are old classes kept alive by stale bookings.");
}
