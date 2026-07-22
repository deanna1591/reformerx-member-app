/* Find the endpoint that lists a client's package instances (the data behind
   SimplyBook's "Packages" report). Read-only. Run:
     node scripts/sb-probe5.mjs 303                                          */
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].split("#")[0].trim().replace(/^["']|["']$/g, "");
}
const CLIENT = process.argv[2] ?? "303";
const REST = "https://user-api-v2.simplybook.it";
const RPC = "https://user-api.simplybook.it/admin";

const PII = /name$|email|phone|^client$|address/i;
const redact = (o) =>
  Array.isArray(o) ? o.map(redact)
  : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, PII.test(k) && v && typeof v !== "object" ? "***" : redact(v)]))
  : o;

const auth = await fetch(`${REST}/admin/auth`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ company: env.SIMPLYBOOK_COMPANY, login: env.SIMPLYBOOK_LOGIN, password: env.SIMPLYBOOK_USER_KEY }),
}).then((r) => r.json());
if (!auth.token) { console.log("AUTH FAILED", auth); process.exit(1); }
console.log("auth ok\n");
const H = { "Content-Type": "application/json", "X-Company-Login": env.SIMPLYBOOK_COMPANY, "X-Token": auth.token, "X-User-Token": auth.token };

const restCandidates = [
  `/admin/clients/${CLIENT}/packages`,
  `/admin/clients/${CLIENT}/package-instances`,
  `/admin/package-instances?filter[client_id]=${CLIENT}`,
  `/admin/packages/instances?filter[client_id]=${CLIENT}`,
  `/admin/packages?filter[client_id]=${CLIENT}`,
  `/admin/clients/packages?filter[client_id]=${CLIENT}`,
  `/admin/memberships/instances?filter[client_id]=${CLIENT}`,
  `/admin/packages`,
];

console.log("== REST candidates ==");
for (const path of restCandidates) {
  try {
    const r = await fetch(`${REST}${path}`, { headers: H });
    const txt = await r.text();
    let body = null;
    try { body = JSON.parse(txt); } catch { /* non-json */ }
    const rows = Array.isArray(body) ? body : body?.data ?? null;
    const count = rows ? rows.length : "-";
    console.log(`  ${r.status}  ${path}  rows=${count}`);
    if (r.ok && rows && rows.length) {
      console.log("    sample:", JSON.stringify(redact(rows[0])).slice(0, 700));
    }
  } catch (e) {
    console.log(`  ERR  ${path}: ${e.message}`);
  }
}

const rpcCandidates = [
  ["getClientPackagesList", [Number(CLIENT)]],
  ["getClientPackages", [Number(CLIENT)]],
  ["getPackageInstancesList", [{ client_id: Number(CLIENT) }]],
  ["getPackagesList", [{}]],
  ["getClientPackageList", [Number(CLIENT)]],
];

console.log("\n== JSON-RPC candidates ==");
for (const [method, params] of rpcCandidates) {
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    }).then((r) => r.json());
    if (res.error) {
      console.log(`  ${method}: error — ${res.error.message}`);
    } else {
      const rows = Array.isArray(res.result) ? res.result : res.result ? [res.result] : [];
      console.log(`  ${method}: OK, ${rows.length} rows`);
      if (rows.length) console.log("    sample:", JSON.stringify(redact(rows[0])).slice(0, 700));
    }
  } catch (e) {
    console.log(`  ${method}: ${e.message}`);
  }
}

console.log("\nDone — paste this output.");
