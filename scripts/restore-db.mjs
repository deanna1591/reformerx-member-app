/**
 * Restore collections from a backup file.
 *
 *   node scripts/restore-db.mjs db-backup/app_state-2026-07-30T08-00-00.json --dry
 *   node scripts/restore-db.mjs <file> --only challenges,earnedBadges
 *   node scripts/restore-db.mjs <file> --yes
 *
 * A backup you have never restored from is a guess, not a backup. Run the --dry
 * form once so you know this works before you need it.
 *
 * Defaults to a dry run: nothing is written without --yes. The current state is
 * always saved to backups/ first, so a restore is itself reversible.
 */

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const YES = args.includes("--yes");
const onlyArg = args.find((a) => a.startsWith("--only"));
const only = onlyArg ? (onlyArg.split("=")[1] ?? args[args.indexOf(onlyArg) + 1] ?? "").split(",").filter(Boolean) : null;

if (!file) {
  console.error("Usage: node scripts/restore-db.mjs <backup.json> [--only a,b] [--yes]");
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error(`No such file: ${file}`);
  process.exit(1);
}

let SUPA = process.env.SUPABASE_URL ?? "";
let KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if ((!SUPA || !KEY) && fs.existsSync(".env.local")) {
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const v = m[2].replace(/^["']|["']$/g, "").trim();
    if (m[1] === "SUPABASE_URL" && !SUPA) SUPA = v;
    if (m[1] === "SUPABASE_SERVICE_ROLE_KEY" && !KEY) KEY = v;
  }
}
SUPA = SUPA.replace(/\/$/, "");
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const backup = JSON.parse(fs.readFileSync(file, "utf8"));
if (!Array.isArray(backup)) {
  console.error("Unexpected file shape — expected the array written by backup-db.mjs");
  process.exit(1);
}

/* ---------- compare against live ---------- */
const liveRes = await fetch(`${SUPA}/rest/v1/app_state?key=like.db:*&select=key,value`, { headers });
const live = liveRes.ok ? await liveRes.json() : [];
const liveMap = new Map(live.map((r) => [r.key, r.value]));

const chosen = backup.filter((r) => !only || only.includes(r.key.replace(/^db:/, "")));
if (chosen.length === 0) {
  console.error("Nothing selected. Check your --only list against manifest.json.");
  process.exit(1);
}

console.log(`Restoring from ${path.basename(file)}\n`);
console.log(`  ${"collection".padEnd(20)} ${"live".padStart(7)} ${"backup".padStart(8)}   change`);
console.log("  " + "-".repeat(56));
for (const r of chosen.sort((a, b) => a.key.localeCompare(b.key))) {
  const name = r.key.replace(/^db:/, "");
  const l = liveMap.get(r.key);
  const lc = Array.isArray(l) ? l.length : l ? "obj" : 0;
  const bc = Array.isArray(r.value) ? r.value.length : "obj";
  const delta =
    typeof lc === "number" && typeof bc === "number"
      ? bc === lc ? "same" : bc > lc ? `+${bc - lc}` : `${bc - lc} LOSS`
      : "replace";
  console.log(`  ${name.padEnd(20)} ${String(lc).padStart(7)} ${String(bc).padStart(8)}   ${delta}`);
}

const losses = chosen.filter((r) => {
  const l = liveMap.get(r.key);
  return Array.isArray(l) && Array.isArray(r.value) && r.value.length < l.length;
});
if (losses.length) {
  console.log(`\n  ${losses.length} collection(s) would LOSE rows — the backup is older than live data.`);
}

if (!YES) {
  console.log("\nDry run. Re-run with --yes to apply.");
  process.exit(0);
}

/* ---------- save current state, then write ---------- */
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.mkdirSync("backups", { recursive: true });
const pre = `backups/pre-restore-${stamp}.json`;
fs.writeFileSync(pre, JSON.stringify(live, null, 2));
console.log(`\nCurrent state saved to ${pre}`);

const res = await fetch(`${SUPA}/rest/v1/app_state?on_conflict=key`, {
  method: "POST",
  headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify(chosen.map((r) => ({ key: r.key, value: r.value, updated_at: new Date().toISOString() }))),
});
if (!res.ok) {
  console.error("WRITE FAILED:", res.status, (await res.text()).slice(0, 300));
  process.exit(1);
}

const back = await fetch(`${SUPA}/rest/v1/app_state?key=like.db:*&select=key,value`, { headers });
const after = back.ok ? await back.json() : [];
const afterMap = new Map(after.map((r) => [r.key, r.value]));
let ok = 0;
for (const r of chosen) {
  const a = afterMap.get(r.key);
  const expect = Array.isArray(r.value) ? r.value.length : -1;
  const got = Array.isArray(a) ? a.length : -1;
  if (expect === got) ok++;
  else console.log(`  MISMATCH ${r.key}: expected ${expect}, got ${got}`);
}
console.log(`\nRestored ${ok}/${chosen.length} collections, verified by read-back.`);
