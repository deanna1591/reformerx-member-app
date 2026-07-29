/**
 * Does SimplyBook return more slots for a wide date range than for a single day?
 *
 *   node scripts/sb-range-vs-day.mjs 2026-07-31
 *
 * The sync asks for today..+21d in one call per service/provider. My earlier
 * diagnostic asked for one day. If the wide call returns extra slots, that is
 * the whole bug: those extras become real class rows and then survive pruning
 * because they are, technically, "on the timetable".
 */
import fs from "node:fs";
import path from "node:path";

const FOCUS = process.argv[2];
if (!FOCUS || !/^\d{4}-\d{2}-\d{2}$/.test(FOCUS)) {
  console.error("Usage: node scripts/sb-range-vs-day.mjs YYYY-MM-DD");
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const BASE = env.SIMPLYBOOK_API_BASE || "https://user-api-v2.simplybook.it";
const company = env.SIMPLYBOOK_COMPANY, login = env.SIMPLYBOOK_LOGIN, key = env.SIMPLYBOOK_USER_KEY;

const auth = await fetch(`${BASE}/admin/auth`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ company, login, password: key }),
});
const token = (await auth.json()).token;
const get = async (p) => {
  const r = await fetch(`${BASE}${p}`, { headers: { "X-Company-Login": company, "X-Token": token } });
  if (!r.ok) throw new Error(`${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : {};
};

const svcRaw = await get("/admin/services?page=1&on_page=100");
const services = (Array.isArray(svcRaw) ? svcRaw : svcRaw.data ?? []).filter((s) => s.is_active !== false);

const today = new Date().toISOString().slice(0, 10);
const plus21 = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);

async function query(from, to) {
  const byDate = new Map();
  for (const svc of services) {
    for (const pid of (svc.providers ?? []).length ? svc.providers : [undefined]) {
      const q = new URLSearchParams({
        service_id: String(svc.id), date_from: from, date_to: to,
        count: "1", skip_min_max_restriction: "0",
      });
      if (pid) q.set("provider_id", String(pid));
      try {
        const days = await get(`/admin/timeline/slots?${q}`);
        for (const d of days ?? []) {
          for (const s of d.slots ?? []) {
            if (!d.date || !s.time) continue;
            if (!byDate.has(d.date)) byDate.set(d.date, []);
            byDate.get(d.date).push(`${s.time.slice(0, 5)} ${String(svc.name).slice(0, 22)}`);
          }
        }
      } catch { /* counted as zero */ }
    }
  }
  return byDate;
}

console.log(`RANGE QUERY  ${today} .. ${plus21}   (what the sync does)`);
const range = await query(today, plus21);
const total = [...range.values()].reduce((n, a) => n + a.length, 0);
console.log(`  ${total} slots across ${range.size} dates\n`);
for (const d of [...range.keys()].sort().slice(0, 8)) {
  console.log(`  ${d}  ${String(range.get(d).length).padStart(2)} slots`);
}

console.log(`\nSINGLE-DAY QUERY  ${FOCUS}   (what my first diagnostic did)`);
const day = await query(FOCUS, FOCUS);
const dayList = day.get(FOCUS) ?? [];
console.log(`  ${dayList.length} slots\n`);

const rangeList = (range.get(FOCUS) ?? []).slice().sort();
console.log(`COMPARISON FOR ${FOCUS}`);
console.log(`  range call  -> ${rangeList.length} slots`);
rangeList.forEach((s) => console.log(`      ${s}`));
console.log(`  day call    -> ${dayList.length} slots`);
dayList.slice().sort().forEach((s) => console.log(`      ${s}`));

console.log("\n---");
if (rangeList.length > dayList.length) {
  console.log("CONFIRMED: the wide range returns extra slots that a single-day call does not.");
  console.log("Those extras become class rows and then survive pruning. Fix = query per day.");
} else if (rangeList.length === dayList.length) {
  console.log("Range and single-day agree. The extra classes come from somewhere else.");
} else {
  console.log("Range returns FEWER slots than the day call — different problem again.");
}
