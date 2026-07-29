/**
 * Trace the timetable prune decision for one date, against live data.
 *
 *   node scripts/prune-trace.mjs 2026-07-31
 *
 * Read-only. Loads the stored classes/bookings from Supabase AND the live
 * SimplyBook timetable, prints raw startsAt strings and class ids side by side,
 * then applies the prune's own rules and reports the verdict for each row.
 *
 * No transformation, no timezone maths on my side — raw strings only, because
 * the mismatch is most likely in exactly that.
 */
import fs from "node:fs";
import path from "node:path";

const DATE = process.argv[2];
if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) {
  console.error("Usage: node scripts/prune-trace.mjs YYYY-MM-DD");
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

/* ---------- Supabase ---------- */
const SUPA = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
const SKEY = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const sHeaders = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };

async function collection(name) {
  const r = await fetch(`${SUPA}/rest/v1/app_state?key=eq.db:${name}&select=value`, { headers: sHeaders });
  const rows = await r.json();
  if (rows.length && rows[0].value != null) return rows[0].value;
  console.error(`  !! no db:${name} row found — not falling back to the legacy blob`);
  return [];
}

const classes = await collection("classes");
const bookings = await collection("bookings");
const settings = await collection("settings");
console.log(`lastSync: ${settings?.lastSync ?? "(none)"}\n`);

/* ---------- SimplyBook ---------- */
const BASE = env.SIMPLYBOOK_API_BASE || "https://user-api-v2.simplybook.it";
const company = env.SIMPLYBOOK_COMPANY;
const a = await fetch(`${BASE}/admin/auth`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ company, login: env.SIMPLYBOOK_LOGIN, password: env.SIMPLYBOOK_USER_KEY }),
});
const token = (await a.json()).token;
const get = async (p) => {
  const r = await fetch(`${BASE}${p}`, { headers: { "X-Company-Login": company, "X-Token": token } });
  const t = await r.text();
  return t ? JSON.parse(t) : {};
};

const svcRaw = await get("/admin/services?page=1&on_page=100");
const services = (Array.isArray(svcRaw) ? svcRaw : svcRaw.data ?? []).filter((s) => s.is_active !== false);

const live = [];
for (const svc of services) {
  for (const pid of (svc.providers ?? []).length ? svc.providers : [undefined]) {
    const q = new URLSearchParams({
      service_id: String(svc.id), date_from: DATE, date_to: DATE,
      count: "1", skip_min_max_restriction: "0",
    });
    if (pid) q.set("provider_id", String(pid));
    try {
      const days = await get(`/admin/timeline/slots?${q}`);
      for (const d of days ?? []) for (const s of d.slots ?? []) {
        if (d.date === DATE && s.time) live.push({ svcId: String(svc.id), name: svc.name, date: d.date, time: s.time });
      }
    } catch { /* ignore */ }
  }
}

console.log(`LIVE TIMETABLE for ${DATE} — ${live.length} slot(s)`);
for (const s of live) console.log(`  service=${s.svcId.padEnd(4)} raw date="${s.date}" time="${s.time}"  ${s.name}`);

const stored = classes
  .filter((c) => String(c.startsAt).slice(0, 10) === DATE)
  .sort((x, y) => String(x.startsAt).localeCompare(String(y.startsAt)));

console.log(`\nSTORED CLASSES for ${DATE} — ${stored.length} row(s)\n`);
for (const c of stored) {
  const n = bookings.filter((b) => b.classId === c.id).length;
  // The prune's actual test: is this exact id among the ids the timetable built?
  const matchedLive = live.some((s) => c.id.startsWith(`c-sb-${s.svcId}-`) && String(c.startsAt).includes(s.time.slice(0, 5)));
  const verdict = matchedLive ? "on timetable -> KEEP"
    : n > 0 ? `has ${n} booking(s) -> KEEP`
    : "NOT on timetable, no bookings -> SHOULD BE PRUNED";
  console.log(`  startsAt="${c.startsAt}"`);
  console.log(`    id        ${c.id}`);
  console.log(`    serviceId ${c.serviceId ?? "(none)"}   bookings ${n}`);
  console.log(`    ${verdict}\n`);
}

const shouldGo = stored.filter((c) => {
  const n = bookings.filter((b) => b.classId === c.id).length;
  const m = live.some((s) => c.id.startsWith(`c-sb-${s.svcId}-`) && String(c.startsAt).includes(s.time.slice(0, 5)));
  return !m && n === 0;
});
console.log(`---\n${shouldGo.length} row(s) should have been pruned and were not.`);
if (shouldGo.length) {
  console.log("Compare the id format above against what the timetable would build:");
  for (const s of live) console.log(`  timetable would build: c-sb-${s.svcId}-<iso for ${s.date} ${s.time}>`);
}
