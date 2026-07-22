/* The report engine: POST /admin/detailed-report returns a report id,
   GET /admin/detailed-report/{id} should return its rows.
   Read-only. Run: node scripts/sb-probe7.mjs 303 */
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
console.log("auth ok\n");

// 1 — create a report, then read it back
const post = await fetch(`${V2}/admin/detailed-report`, {
  method: "POST", headers: H,
  body: JSON.stringify({ filter: { report_type: "package-instances", client_id: Number(CLIENT) } }),
}).then((r) => r.json());
console.log("POST /admin/detailed-report ->", JSON.stringify(post));

for (const id of [post?.id, "37"].filter(Boolean)) {
  const r = await fetch(`${V2}/admin/detailed-report/${id}`, { headers: H });
  const t = await r.text();
  let b = null; try { b = JSON.parse(t); } catch {}
  const rows = Array.isArray(b) ? b : b?.data ?? null;
  console.log(`\nGET /admin/detailed-report/${id} -> ${r.status}, rows=${rows ? rows.length : "-"}`);
  console.log("  ", JSON.stringify(redact(b)).slice(0, 900));
}

// 2 — the same report with paging params, in case rows come from a list call
const q = new URLSearchParams({ "filter[client_id]": CLIENT, on_page: "50" });
for (const path of [`/admin/detailed-report/37?${q}`, `/admin/detailed-report?${q}`]) {
  const r = await fetch(`${V2}${path}`, { headers: H });
  const t = await r.text();
  console.log(`\nGET ${path} -> ${r.status}`);
  console.log("  ", t.slice(0, 400));
}
console.log("\nDone — paste this output.");
