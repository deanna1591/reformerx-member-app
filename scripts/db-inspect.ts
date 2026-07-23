/* Inspect (and optionally back up) what's actually stored in Supabase.
 *   npx tsx scripts/db-inspect.ts            → summary of the remote row
 *   npx tsx scripts/db-inspect.ts --backup   → also write a local JSON backup
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].split("#")[0].trim().replace(/^["']|["']$/g, "");
}

const URL_ = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BACKUP = process.argv.includes("--backup");

async function main() {
  if (!URL_ || !KEY) {
    console.log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local");
    return;
  }
  console.log("project:", URL_);

  const res = await fetch(`${URL_}/rest/v1/app_state?key=eq.db&select=value,updated_at`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    cache: "no-store",
  });
  if (!res.ok) {
    console.log(`read failed: HTTP ${res.status}`, (await res.text()).slice(0, 200));
    return;
  }
  const rows = (await res.json()) as Array<{ value: Record<string, unknown[]>; updated_at?: string }>;
  if (rows.length === 0) {
    console.log("\nNo 'db' row in app_state — the database is empty.");
    console.log("Run a sync to populate it: npx tsx scripts/run-sync.ts");
    return;
  }

  const db = rows[0].value as Record<string, unknown>;
  const count = (k: string) => (Array.isArray(db[k]) ? (db[k] as unknown[]).length : 0);
  console.log("updated:", rows[0].updated_at ?? "(unknown)");
  console.log("\nrows stored remotely:");
  for (const k of ["members", "classes", "bookings", "checkIns", "instructors", "challenges", "challengeProgress", "earnedRewards", "packages", "promotions", "waitlist", "notifications"]) {
    console.log(`  ${k.padEnd(20)} ${count(k)}`);
  }
  const settings = db.settings as { lastSync?: string } | undefined;
  console.log(`  lastSync            ${settings?.lastSync?.split("|")[0] ?? "never"}`);

  const members = (db.members ?? []) as Array<{ email?: string }>;
  console.log(`\nlooks like: ${members.length > 100 ? "REAL studio data" : members.length === 0 ? "an EMPTY seed — real data is not here" : "partial data"}`);

  if (BACKUP) {
    mkdirSync(".backups", { recursive: true });
    const file = `.backups/app_state-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(file, JSON.stringify(rows[0].value, null, 2));
    console.log(`\nbackup written: ${file}`);
  } else {
    console.log("\n(run with --backup to save a copy locally first)");
  }
}

main();
