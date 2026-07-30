/**
 * Dump every app_state collection to db-backup/.
 *
 *   node scripts/backup-db.mjs
 *
 * Reads credentials from the environment (GitHub Actions) and falls back to
 * .env.local so it also runs on your Mac.
 *
 * Discovers collections with a `db:` prefix match rather than a hardcoded list,
 * so a new collection is backed up automatically instead of being quietly
 * missed — which is exactly how a backup ends up incomplete on the day it
 * matters.
 */

import fs from "node:fs";
import path from "node:path";

/* ---------- credentials ---------- */
let SUPA = process.env.SUPABASE_URL ?? "";
let KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if ((!SUPA || !KEY) && fs.existsSync(path.join(process.cwd(), ".env.local"))) {
  for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const v = m[2].replace(/^["']|["']$/g, "").trim();
    if (m[1] === "SUPABASE_URL" && !SUPA) SUPA = v;
    if (m[1] === "SUPABASE_SERVICE_ROLE_KEY" && !KEY) KEY = v;
  }
}
SUPA = SUPA.replace(/\/$/, "");
if (!SUPA || !KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (env or .env.local)");
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

/* ---------- fetch everything ---------- */
const res = await fetch(`${SUPA}/rest/v1/app_state?key=like.db:*&select=key,value,updated_at`, { headers });
if (!res.ok) {
  console.error("read failed:", res.status, (await res.text()).slice(0, 300));
  process.exit(1);
}
const rows = await res.json();
if (!Array.isArray(rows) || rows.length === 0) {
  console.error("No db: rows returned. Refusing to write an empty backup.");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = "db-backup";
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const manifest = { takenAt: new Date().toISOString(), host: new URL(SUPA).host, collections: {} };
let total = 0;

for (const r of rows.sort((a, b) => a.key.localeCompare(b.key))) {
  const name = r.key.replace(/^db:/, "");
  const json = JSON.stringify(r.value);
  const count = Array.isArray(r.value) ? r.value.length : null;
  manifest.collections[name] = { rows: count, bytes: json.length, updated_at: r.updated_at };
  total += json.length;
  console.log(
    `  ${name.padEnd(20)} ${String(count ?? "object").padStart(6)} rows  ${(json.length / 1024).toFixed(1).padStart(8)} KB`
  );
}

// One combined file restores cleanly; per-collection files are easier to eyeball.
fs.writeFileSync(path.join(outDir, `app_state-${stamp}.json`), JSON.stringify(rows, null, 2));
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`\n${rows.length} collections, ${(total / 1048576).toFixed(2)} MB -> ${outDir}/`);

/* ---------- sanity flags ---------- */
// A backup of a broken state is still worth keeping, but it should say so
// loudly rather than look like a healthy one in six months' time.
const warn = [];
const n = (k) => manifest.collections[k]?.rows ?? 0;
if (n("members") < 100) warn.push(`members is only ${n("members")}`);
if (n("bookings") < 500) warn.push(`bookings is only ${n("bookings")}`);
if (n("challenges") === 0) warn.push("challenges is empty");
if (warn.length) {
  console.log("\nWARNING — this snapshot looks thin:");
  for (const w of warn) console.log(`  ${w}`);
  console.log("Backed up anyway. Check the app before relying on this file.");
}
