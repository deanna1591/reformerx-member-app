/* SimplyBook probe — prints REDACTED samples of what the API actually returns.
   Run: node scripts/sb-probe.mjs
   Reads credentials from .env.local. Masks names/emails/phones before printing. */
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].split("#")[0].trim().replace(/^["']|["']$/g, "");
}
const COMPANY = env.SIMPLYBOOK_COMPANY, LOGIN = env.SIMPLYBOOK_LOGIN, KEY = env.SIMPLYBOOK_USER_KEY;
const REST = "https://user-api-v2.simplybook.it";
const RPC = "https://user-api.simplybook.it/admin";

const PII = /name|email|phone|client$|^text$|comment/i;
function redact(obj) {
  if (Array.isArray(obj)) return obj.map(redact);
  if (obj && typeof obj === "object")
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, PII.test(k) && v ? "***" : redact(v)])
    );
  return obj;
}
const show = (label, x) => console.log(`\n===== ${label} =====\n` + JSON.stringify(redact(x), null, 1).slice(0, 2200));

const auth = await fetch(`${REST}/admin/auth`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ company: COMPANY, login: LOGIN, password: KEY }),
}).then((r) => r.json());
if (!auth.token) { console.log("AUTH FAILED", auth); process.exit(1); }
console.log("auth ok");
const H = { "Content-Type": "application/json", "X-Company-Login": COMPANY, "X-Token": auth.token, "X-User-Token": auth.token };

const from = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const to = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

/* 1 — REST bookings: try both param styles, show status + first item */
for (const q of [`filter[date_from]=${from}&filter[date_to]=${to}`, `date_from=${from}&date_to=${to}`]) {
  const r = await fetch(`${REST}/admin/bookings?${q}&on_page=3`, { headers: H });
  let body; try { body = await r.json(); } catch { body = await r.text(); }
  const rows = Array.isArray(body) ? body : body?.data ?? [];
  show(`REST /admin/bookings?${q.split("&")[0]}… → HTTP ${r.status}, ${rows.length ?? 0} rows`, rows[0] ?? body);
  if (rows.length) break;
}

/* 2 — RPC getBookings sample */
const rb = await fetch(RPC, { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", method: "getBookings", params: [{ date_from: from, date_to: to }], id: 1 }) }).then((r) => r.json());
show(`RPC getBookings → ${Array.isArray(rb.result) ? rb.result.length + " rows" : "error"}`, rb.result?.[0] ?? rb.error);

/* 3 — memberships: scan client ids from RPC bookings until one has memberships */
const clientIds = [...new Set((rb.result ?? []).map((b) => b.client_id).filter(Boolean))].slice(0, 40);
console.log(`\nscanning ${clientIds.length} clients for memberships…`);
let found = 0;
for (const cid of clientIds) {
  const rm = await fetch(RPC, { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", method: "getClientMembershipList", params: [Number(cid)], id: 1 }) }).then((r) => r.json());
  if (rm.error) { show(`RPC getClientMembershipList(${cid}) → ERROR`, rm.error); break; }
  const rows = Array.isArray(rm.result) ? rm.result : [];
  if (rows.length) { show(`RPC getClientMembershipList(client ${cid}) → ${rows.length} rows`, rows[0]); if (++found >= 2) break; }
}
if (!found) console.log("→ none of the scanned clients returned membership rows.");

/* 4 — membership product catalog (names!) */
const rp = await fetch(RPC, { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", method: "getMembership", params: [1], id: 1 }) }).then((r) => r.json());
show("RPC getMembership(1)", rp.result ?? rp.error);
console.log("\nDone. Paste this whole output to Claude — PII is already masked.");
