/* Round 2: find the client package-instances endpoint.
   Read-only. Run: node scripts/sb-probe6.mjs 303 */
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].split("#")[0].trim().replace(/^["']|["']$/g, "");
}
const CLIENT = process.argv[2] ?? "303";
const V2 = "https://user-api-v2.simplybook.it";
const PII = /name$|email|phone|^client$|address/i;
const redact = (o) =>
  Array.isArray(o) ? o.map(redact)
  : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, PII.test(k) && v && typeof v !== "object" ? "***" : redact(v)]))
  : o;

const auth = await fetch(`${V2}/admin/auth`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ company: env.SIMPLYBOOK_COMPANY, login: env.SIMPLYBOOK_LOGIN, password: env.SIMPLYBOOK_USER_KEY }),
}).then((r) => r.json());
if (!auth.token) { console.log("AUTH FAILED", auth); process.exit(1); }
const H = { "Content-Type": "application/json", "X-Company-Login": env.SIMPLYBOOK_COMPANY, "X-Token": auth.token };
console.log("auth ok\n== more REST candidates ==");

const paths = [
  `/admin/package-instances`,
  `/admin/package_instances?filter[client_id]=${CLIENT}`,
  `/admin/packages/instances`,
  `/admin/packages/6/instances`,
  `/admin/clients/${CLIENT}/package`,
  `/admin/clients/${CLIENT}/invoices`,
  `/admin/reports/package-instances?filter[client_id]=${CLIENT}`,
  `/admin/detailed-report/package-instances`,
  `/admin/detailed-report/packages`,
];
for (const p of paths) {
  try {
    const r = await fetch(`${V2}${p}`, { headers: H });
    const t = await r.text();
    let b = null; try { b = JSON.parse(t); } catch {}
    const rows = Array.isArray(b) ? b : b?.data ?? null;
    console.log(`  ${r.status}  ${p}  rows=${rows ? rows.length : "-"}`);
    if (r.ok && rows?.length) console.log("    sample:", JSON.stringify(redact(rows[0])).slice(0, 600));
    else if (!r.ok) console.log("    ", t.slice(0, 140));
  } catch (e) { console.log(`  ERR ${p}: ${e.message}`); }
}

console.log("\n== POST /admin/detailed-report (report engine) ==");
for (const body of [
  { filter: { report_type: "package-instances", client_id: Number(CLIENT) } },
  { filter: { type: "package_instances", client_id: Number(CLIENT) } },
  { filter: { client_id: Number(CLIENT) }, report: "package-instances" },
]) {
  try {
    const r = await fetch(`${V2}/admin/detailed-report`, { method: "POST", headers: H, body: JSON.stringify(body) });
    const t = await r.text();
    console.log(`  ${r.status} ${JSON.stringify(body).slice(0, 70)} -> ${t.slice(0, 220)}`);
  } catch (e) { console.log("  ERR", e.message); }
}

console.log("\n== package catalogue detail (id 6) ==");
const r = await fetch(`${V2}/admin/packages/6`, { headers: H });
const t = await r.text();
let pkg = null; try { pkg = JSON.parse(t); } catch {}
if (pkg) {
  const { id, name, price, currency, duration, duration_type, is_active, services, products } = pkg;
  console.log(JSON.stringify({ id, name: "***", price, currency, duration, duration_type, is_active,
    services: Array.isArray(services) ? services.map((s) => ({ service_id: s.service_id, qty: s.qty })) : services,
    products: Array.isArray(products) ? products.length : products }, null, 1));
} else console.log(`  ${r.status}`, t.slice(0, 200));
console.log("\nDone — paste this output.");
