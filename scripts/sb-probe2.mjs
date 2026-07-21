/* Probe SimplyBook invoices + packages. Run: node scripts/sb-probe2.mjs
   Prints REDACTED samples — safe to paste. */
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].split("#")[0].trim().replace(/^["']|["']$/g, "");
}
const REST = "https://user-api-v2.simplybook.it";
const RPC = "https://user-api.simplybook.it/admin";
const PII = /name|email|phone|client$|^text$|comment|address/i;
const redact = (o) =>
  Array.isArray(o) ? o.map(redact)
  : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, PII.test(k) && v && typeof v !== "object" ? "***" : redact(v)]))
  : o;
const show = (l, x, n = 2400) => console.log(`\n===== ${l} =====\n` + JSON.stringify(redact(x), null, 1).slice(0, n));

const auth = await fetch(`${REST}/admin/auth`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ company: env.SIMPLYBOOK_COMPANY, login: env.SIMPLYBOOK_LOGIN, password: env.SIMPLYBOOK_USER_KEY }),
}).then((r) => r.json());
if (!auth.token) { console.log("AUTH FAILED", auth); process.exit(1); }
console.log("auth ok");
const H = { "Content-Type": "application/json", "X-Company-Login": env.SIMPLYBOOK_COMPANY, "X-Token": auth.token, "X-User-Token": auth.token };

/* 1 — raw invoices list, no filters: does it work, what envelope, what keys */
let r = await fetch(`${REST}/admin/invoices?on_page=3`, { headers: H });
let body; try { body = await r.json(); } catch { body = await r.text(); }
let rows = Array.isArray(body) ? body : body?.data ?? [];
console.log(`\n/admin/invoices (no filter): HTTP ${r.status}, rows: ${rows.length}, envelope: ${Array.isArray(body) ? "array" : Object.keys(body || {}).join(",")}`);
if (rows[0]) {
  console.log("invoice keys:", Object.keys(rows[0]).join(", "));
  show("first invoice", rows[0]);
} else show("body", body, 800);

/* 2 — datetime filter variants */
const from = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
for (const q of [`filter[datetime_from]=${from}`, `filter[date_from]=${from}`]) {
  const rr = await fetch(`${REST}/admin/invoices?${q}&on_page=2`, { headers: H });
  let bb; try { bb = await rr.json(); } catch { bb = null; }
  const rws = Array.isArray(bb) ? bb : bb?.data ?? [];
  console.log(`/admin/invoices?${q} → HTTP ${rr.status}, rows: ${rws.length}`);
}

/* 3 — find an invoice that has package_instances or package/membership lines */
r = await fetch(`${REST}/admin/invoices?on_page=50`, { headers: H });
try { body = await r.json(); } catch { body = null; }
rows = Array.isArray(body) ? body : body?.data ?? [];
const withPkg = rows.find((i) => (i.package_instances?.length ?? 0) > 0);
const withLines = rows.find((i) => Array.isArray(i.lines) && i.lines.some((l) => /package|membership/i.test(l?.type ?? "")));
console.log(`\nscanned ${rows.length} recent invoices: with package_instances: ${rows.filter((i) => i.package_instances?.length).length}, with package/membership lines: ${rows.filter((i) => Array.isArray(i.lines) && i.lines.some((l) => /package|membership/i.test(l?.type ?? ""))).length}`);
if (withPkg) show("invoice WITH package_instances", { package_instances: withPkg.package_instances, status: withPkg.status, payment_received: withPkg.payment_received });
if (withLines) show("invoice WITH package/membership line", { lines: withLines.lines, status: withLines.status });
if (rows[0]?.lines) show("sample invoice lines (types)", rows.slice(0, 8).map((i) => ({ id: i.id, status: i.status, line_types: (i.lines ?? []).map((l) => l?.type) })));

/* 4 — package catalog via RPC and REST products */
const rp = await fetch(RPC, { method: "POST", headers: H, body: JSON.stringify({ jsonrpc: "2.0", method: "getProductList", params: [{}], id: 1 }) }).then((x) => x.json());
show("RPC getProductList", (Array.isArray(rp.result) ? rp.result.slice(0, 5) : rp.result) ?? rp.error);
const pr = await fetch(`${REST}/admin/products?on_page=10`, { headers: H });
let pb; try { pb = await pr.json(); } catch { pb = null; }
show(`REST /admin/products (HTTP ${pr.status})`, (Array.isArray(pb) ? pb : pb?.data ?? pb)?.slice?.(0, 5) ?? pb, 1600);
console.log("\nDone — paste everything above.");
