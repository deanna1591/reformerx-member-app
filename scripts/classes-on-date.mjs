/**
 * Inspect the app's own class rows for one date.
 *
 *   node scripts/classes-on-date.mjs 2026-07-31
 *
 * Read-only. Pulls app_state out of Supabase exactly the way src/lib/store.ts
 * does and prints every class on that date with the two fields that decide
 * whether the timetable prune is allowed to remove it: serviceId, and how many
 * bookings point at it.
 */

import fs from "node:fs";
import path from "node:path";

const DATE = process.argv[2];
if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) {
  console.error("Usage: node scripts/classes-on-date.mjs YYYY-MM-DD");
  process.exit(1);
}

const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("No .env.local in", process.cwd());
  process.exit(1);
}
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const URL_ = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!URL_ || !KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function loadCollection(name) {
  const res = await fetch(`${URL_}/rest/v1/app_state?key=eq.db:${name}&select=value`, { headers });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  if (rows.length && rows[0].value != null) return rows[0].value;

  console.error(`  !! no db:${name} row found — not falling back to the legacy blob`);
  return [];
}

const classes = await loadCollection("classes");
const bookings = await loadCollection("bookings");
console.log(`DB: ${classes.length} classes, ${bookings.length} bookings total\n`);

const onDate = classes
  .filter((c) => String(c.startsAt).slice(0, 10) === DATE)
  .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));

if (!onDate.length) {
  console.log(`No classes stored for ${DATE}.`);
  process.exit(0);
}

console.log(`CLASSES ON ${DATE}\n`);
console.log(
  "  " +
    "time".padEnd(7) +
    "title".slice(0, 26).padEnd(28) +
    "serviceId".padEnd(11) +
    "bookings".padEnd(9) +
    "verdict"
);
console.log("  " + "-".repeat(78));

for (const c of onDate) {
  const time = new Date(c.startsAt).toISOString().slice(11, 16);
  const n = bookings.filter((b) => b.classId === c.id).length;
  const hasSvc = c.serviceId != null && c.serviceId !== "";

  let verdict;
  if (n > 0) verdict = "kept: has bookings";
  else if (!hasSvc) verdict = "KEPT BY serviceId GUARD  <-- the bug";
  else verdict = "prunable";

  console.log(
    "  " +
      time.padEnd(7) +
      String(c.title).slice(0, 26).padEnd(28) +
      String(c.serviceId ?? "—").padEnd(11) +
      String(n).padEnd(9) +
      verdict
  );
  if (n === 0 && !hasSvc) console.log("           id: " + c.id);
}

const noSvc = onDate.filter((c) => !c.serviceId && !bookings.some((b) => b.classId === c.id)).length;
console.log(
  `\n${noSvc} class(es) on this date have no serviceId and no bookings — those are the ones stuck.`
);
