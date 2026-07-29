/**
 * Are the duplicate class rows a timezone bug, or genuinely different classes?
 *
 *   node scripts/booking-vs-timetable.mjs 2026-07-31
 *
 * Read-only. Pulls the raw getBookings rows for one date and prints their
 * unmodified start timestamps next to the timetable's, so the two conversion
 * paths can be compared directly instead of inferred from stored ids.
 */
import fs from "node:fs";
import path from "node:path";

const DATE = process.argv[2];
if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) {
  console.error("Usage: node scripts/booking-vs-timetable.mjs YYYY-MM-DD");
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const BASE = env.SIMPLYBOOK_API_BASE || "https://user-api-v2.simplybook.it";
const company = env.SIMPLYBOOK_COMPANY;

const auth = await fetch(`${BASE}/admin/auth`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ company, login: env.SIMPLYBOOK_LOGIN, password: env.SIMPLYBOOK_USER_KEY }),
});
const token = (await auth.json()).token;

const get = async (p) => {
  const r = await fetch(`${BASE}${p}`, { headers: { "X-Company-Login": company, "X-Token": token } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : {};
};

/* --- raw bookings via JSON-RPC, exactly as the sync fetches them --- */
const rpcBase = BASE.replace("user-api-v2", "user-api");
const rpc = await fetch(`${rpcBase}/admin`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Company-Login": company, "X-User-Token": token, "X-Token": token },
  body: JSON.stringify({ jsonrpc: "2.0", method: "getBookings", params: [{ date_from: DATE, date_to: DATE, order: "start_date" }], id: 1 }),
});
const rpcJson = await rpc.json();
const bookings = Array.isArray(rpcJson.result) ? rpcJson.result : [];

console.log(`RAW BOOKINGS for ${DATE} — ${bookings.length} row(s)`);
console.log("  (unmodified values straight from getBookings)\n");
for (const b of bookings.slice(0, 25)) {
  const start = b.start_datetime ?? b.start_date_time ?? b.start_date;
  const svc = b.service?.id ?? b.event_id ?? "?";
  const svcName = b.service?.name ?? b.event ?? "?";
  const prov = b.provider?.name ?? b.unit ?? "?";
  const status = b.status ?? (b.is_confirm === false ? "unconfirmed" : "");
  console.log(`  start="${start}"  svc=${svc} ${String(svcName).slice(0, 24)}  ${String(prov).slice(0, 12)}  ${status}`);
}

/* --- timetable for the same date --- */
const svcRaw = await get("/admin/services?page=1&on_page=100");
const services = (Array.isArray(svcRaw) ? svcRaw : svcRaw.data ?? []).filter((s) => s.is_active !== false);
const slots = [];
for (const svc of services) {
  for (const pid of (svc.providers ?? []).length ? svc.providers : [undefined]) {
    const q = new URLSearchParams({ service_id: String(svc.id), date_from: DATE, date_to: DATE, count: "1", skip_min_max_restriction: "0" });
    if (pid) q.set("provider_id", String(pid));
    try {
      const days = await get(`/admin/timeline/slots?${q}`);
      for (const d of days ?? []) for (const s of d.slots ?? []) {
        if (d.date === DATE && s.time) slots.push({ svc: svc.id, name: svc.name, raw: `${d.date} ${s.time}` });
      }
    } catch { /* ignore */ }
  }
}

console.log(`\nTIMETABLE for ${DATE} — ${slots.length} slot(s)`);
for (const s of slots) console.log(`  raw="${s.raw}"  svc=${s.svc} ${String(s.name).slice(0, 24)}`);

console.log("\n---");
console.log("Both paths run studioToISO() on the raw string above.");
console.log("Same format on both sides -> the extra rows are real, older classes.");
console.log("Different format (offset, T/Z, epoch) -> the booking path converts differently.");
