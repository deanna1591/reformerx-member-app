/**
 * Mark non-person providers as activities.
 *
 *   node scripts/flag-activities.mjs --dry
 *   node scripts/flag-activities.mjs
 *
 * SimplyBook models rooms, group activities and role placeholders as
 * "providers", so they land in the instructor table. A member can't take a class
 * *with* one, so they must not count toward Meet Every Coach.
 *
 * Matching is by id, not by name — a rename shouldn't silently re-enable one.
 */
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry");

// Ids from the current roster. Add to this list if new ones appear.
const ACTIVITY_IDS = ["i-sb-14", "i-sb-16"]; // RX Cycling club, RX Master Teacher

const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const SUPA = (env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const res = await fetch(`${SUPA}/rest/v1/app_state?key=eq.db:instructors&select=value`, { headers });
const rows = await res.json();
const instructors = rows.length && Array.isArray(rows[0].value) ? rows[0].value : [];

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.mkdirSync("backups", { recursive: true });
fs.writeFileSync(`backups/instructors-${stamp}.json`, JSON.stringify(instructors, null, 2));
console.log(`Backed up -> backups/instructors-${stamp}.json\n`);

let changed = 0;
for (const i of instructors) {
  const want = ACTIVITY_IDS.includes(i.id);
  if (want && !i.isActivity) {
    i.isActivity = true;
    changed++;
  }
  const tag = i.isActivity ? "ACTIVITY — excluded" : "coach";
  console.log(`  ${i.id.padEnd(16)} ${String(i.name).slice(0, 24).padEnd(26)} ${tag}`);
}
console.log(`\n${changed} row(s) newly flagged`);

if (DRY) {
  console.log("\n--dry given, nothing written.");
  process.exit(0);
}

const put = await fetch(`${SUPA}/rest/v1/app_state?on_conflict=key`, {
  method: "POST",
  headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify([{ key: "db:instructors", value: instructors, updated_at: new Date().toISOString() }]),
});
if (!put.ok) {
  console.error("WRITE FAILED:", put.status, (await put.text()).slice(0, 200));
  process.exit(1);
}
const back = await fetch(`${SUPA}/rest/v1/app_state?key=eq.db:instructors&select=value`, { headers });
const after = (await back.json())[0]?.value ?? [];
console.log(`\nWrote db:instructors. ${after.filter((i) => i.isActivity).length} flagged as activities, ${after.filter((i) => !i.isActivity).length} coaches.`);
