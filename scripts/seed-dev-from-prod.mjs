/**
 * Copy production app_state into your development project.
 *
 *   node scripts/seed-dev-from-prod.mjs --dry
 *   node scripts/seed-dev-from-prod.mjs
 *
 * One-way by design: reads production, writes dev. There is no flag to do the
 * reverse, so a mistake here can't reach live members.
 *
 * Member emails are scrambled by default so a dev environment can't send a real
 * person a push notification or a login code. Pass --real-emails if you
 * specifically need them.
 */
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry");
const REAL_EMAILS = process.argv.includes("--real-emails");

function parse(file) {
  if (!fs.existsSync(file)) return null;
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

const prod = parse(path.join(process.cwd(), ".env.local"));
const dev = parse(path.join(process.cwd(), ".env.development.local"));

if (!prod?.SUPABASE_URL || !prod?.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("No production credentials in .env.local");
  process.exit(1);
}
if (!dev?.SUPABASE_URL || !dev?.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("No .env.development.local — create it with your dev project's credentials first.");
  process.exit(1);
}
const pHost = new URL(prod.SUPABASE_URL).host;
const dHost = new URL(dev.SUPABASE_URL).host;
if (pHost === dHost) {
  console.error(`Both files point at ${pHost}. Your dev project must be a different Supabase project.`);
  process.exit(1);
}
console.log(`Copying  ${pHost}  ->  ${dHost}\n`);

const pH = { apikey: prod.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${prod.SUPABASE_SERVICE_ROLE_KEY}` };
const dH = { ...{ apikey: dev.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${dev.SUPABASE_SERVICE_ROLE_KEY}` }, "Content-Type": "application/json" };

const res = await fetch(`${prod.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/app_state?key=like.db:*&select=key,value`, { headers: pH });
if (!res.ok) {
  console.error("production read failed:", res.status, (await res.text()).slice(0, 200));
  process.exit(1);
}
const rows = await res.json();

let scrambled = 0;
for (const r of rows) {
  if (r.key === "db:members" && Array.isArray(r.value) && !REAL_EMAILS) {
    for (const m of r.value) {
      if (m.email) {
        m.email = `dev+${String(m.id).replace(/[^a-z0-9]/gi, "")}@example.invalid`;
        scrambled++;
      }
    }
  }
  // Push endpoints must never be copied — a dev run could notify real phones.
  if (r.key === "db:pushSubs") r.value = [];
  const n = Array.isArray(r.value) ? r.value.length : "obj";
  console.log(`  ${r.key.replace("db:", "").padEnd(20)} ${String(n).padStart(6)}`);
}
console.log(`\n${rows.length} collections`);
if (scrambled) console.log(`${scrambled} member emails replaced with dev+…@example.invalid`);
if (REAL_EMAILS) console.log("--real-emails given: REAL addresses copied into dev.");

if (DRY) {
  console.log("\n--dry given, nothing written to dev.");
  process.exit(0);
}

const put = await fetch(`${dev.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/app_state?on_conflict=key`, {
  method: "POST",
  headers: { ...dH, Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify(rows.map((r) => ({ key: r.key, value: r.value, updated_at: new Date().toISOString() }))),
});
if (!put.ok) {
  console.error("dev write failed:", put.status, (await put.text()).slice(0, 300));
  console.error("If the table is missing, run the SQL in docs/dev-setup.md first.");
  process.exit(1);
}
console.log(`\nSeeded ${rows.length} collections into ${dHost}.`);
