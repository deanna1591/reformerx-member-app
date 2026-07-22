/* Verify class counts + booking API. Run: node scripts/sb-probe4.mjs [clientId]
   Read-only by default. PII masked. */
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].split("#")[0].trim().replace(/^["']|["']$/g, "");
}
const REST = "https://user-api-v2.simplybook.it";
const RPC = "https://user-api.simplybook.it/admin";
const CLIENT_ID = process.argv[2];

const auth = await fetch(`${REST}/admin/auth`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ company: env.SIMPLYBOOK_COMPANY, login: env.SIMPLYBOOK_LOGIN, password: env.SIMPLYBOOK_USER_KEY }),
}).then((r) => r.json());
if (!auth.token) { console.log("AUTH FAILED", auth); process.exit(1); }
const H = { "Content-Type": "application/json", "X-Company-Login": env.SIMPLYBOOK_COMPANY, "X-Token": auth.token, "X-User-Token": auth.token };
console.log("auth ok\n");

/* 1 — how many bookings does ONE client have, ever? (the 28-vs-15 question) */
if (CLIENT_ID) {
  let page = 1, total = 0, statuses = {};
  for (;;) {
    const r = await fetch(`${REST}/admin/bookings?filter[client_id]=${CLIENT_ID}&on_page=100&page=${page}`, { headers: H });
    const body = await r.json().catch(() => null);
    const rows = Array.isArray(body) ? body : body?.data ?? [];
    for (const b of rows) statuses[b.status ?? "?"] = (statuses[b.status ?? "?"] ?? 0) + 1;
    total += rows.length;
    const pages = body?.metadata?.pages_count ?? 1;
    if (page >= pages || rows.length === 0 || page > 20) break;
    page++;
  }
  console.log(`client ${CLIENT_ID}: ${total} bookings all-time (REST, paginated)`);
  console.log("  by status:", JSON.stringify(statuses));
} else {
  console.log("tip: pass your SimplyBook client id to count your own bookings, e.g. node scripts/sb-probe4.mjs 303\n");
}

/* 2 — does a single wide RPC call get truncated? compare with monthly chunks */
const to = new Date().toISOString().slice(0, 10);
const from = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
const rpc = async (method, params) =>
  (await fetch(RPC, { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }) }).then((r) => r.json())).result;

const wide = await rpc("getBookings", [{ date_from: from, date_to: to }]);
let chunked = 0;
for (let i = 0; i < 12; i++) {
  const cTo = new Date(Date.now() - i * 30 * 86400000).toISOString().slice(0, 10);
  const cFrom = new Date(Date.now() - (i + 1) * 30 * 86400000).toISOString().slice(0, 10);
  const rows = await rpc("getBookings", [{ date_from: cFrom, date_to: cTo }]);
  chunked += Array.isArray(rows) ? rows.length : 0;
}
console.log(`\n1 year of bookings — single call: ${Array.isArray(wide) ? wide.length : "error"} | 12 monthly chunks: ${chunked}`);
console.log(chunked > (wide?.length ?? 0) ? "→ the single call IS truncated; chunking is required." : "→ single call looks complete.");

/* 3 — services + timetable slots (for the in-app schedule) */
const svcRes = await fetch(`${REST}/admin/services?on_page=20`, { headers: H });
const svcBody = await svcRes.json().catch(() => null);
const services = Array.isArray(svcBody) ? svcBody : svcBody?.data ?? [];
console.log(`\nservices: ${services.length}`);
for (const s of services.slice(0, 8)) console.log(`  id=${s.id} "${s.name}" ${s.duration}min providers=${JSON.stringify(s.providers)}`);

if (services[0]) {
  const q = new URLSearchParams({
    service_id: String(services[0].id),
    date_from: new Date().toISOString().slice(0, 10),
    date_to: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    count: "1",
    skip_min_max_restriction: "1",
    with_available_slots: "1",
  });
  const slotsRes = await fetch(`${REST}/admin/timeline/slots?${q}`, { headers: H });
  const slots = await slotsRes.json().catch(() => null);
  console.log(`\ntimeline/slots for service ${services[0].id}: HTTP ${slotsRes.status}`);
  console.log(JSON.stringify(slots, null, 1).slice(0, 900));
}

console.log("\nDone — paste this output.");
