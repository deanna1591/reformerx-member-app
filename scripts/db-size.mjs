/**
 * How big is the read that every page render performs, and how long does it take?
 *
 *   node scripts/db-size.mjs
 *
 * Read-only. Times the exact query supaLoad() runs, then measures each
 * collection separately so the heavy ones are obvious.
 */
import fs from "node:fs";
import path from "node:path";

const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const URL_ = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const COLLECTIONS = [
  "members", "classes", "bookings", "checkIns", "instructors", "challenges",
  "challengeProgress", "badgeDefs", "earnedBadges", "rewards", "redemptions",
  "notifications", "settings", "waitlist", "promotions", "pushSubs", "products",
];

const mb = (n) => (n / 1048576).toFixed(2) + " MB";

/* the whole-database read, exactly as supaLoad does it */
const keys = COLLECTIONS.map((c) => `"db:${c}"`).join(",");
const t0 = Date.now();
const res = await fetch(`${URL_}/rest/v1/app_state?key=in.(${keys})&select=key,value`, { headers });
const text = await res.text();
const elapsed = Date.now() - t0;

console.log("FULL READ  (what ensureDB does on every page render)");
console.log(`  status   ${res.status}`);
console.log(`  size     ${mb(text.length)}  (${text.length.toLocaleString()} bytes)`);
console.log(`  time     ${(elapsed / 1000).toFixed(1)}s  from your laptop`);
console.log(`  verdict  ${elapsed > 5000 ? "SLOW — this is the bottleneck" : elapsed > 2000 ? "sluggish" : "acceptable"}\n`);

let rows = [];
try { rows = JSON.parse(text); } catch { console.log("  (could not parse response)"); }

console.log("PER COLLECTION");
const sized = rows
  .map((r) => ({
    name: r.key.replace(/^db:/, ""),
    bytes: JSON.stringify(r.value).length,
    count: Array.isArray(r.value) ? r.value.length : "—",
  }))
  .sort((a, b) => b.bytes - a.bytes);

for (const r of sized) {
  const bar = "#".repeat(Math.max(1, Math.round((r.bytes / (sized[0]?.bytes || 1)) * 30)));
  console.log(`  ${r.name.padEnd(20)} ${mb(r.bytes).padStart(9)}  ${String(r.count).padStart(6)} rows  ${bar}`);
}

const total = sized.reduce((n, r) => n + r.bytes, 0);
console.log(`\n  TOTAL ${mb(total)}`);
console.log(`\nEvery page render older than REFRESH_MS (currently 3s) pulls all of this.`);
