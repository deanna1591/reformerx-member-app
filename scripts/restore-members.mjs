/**
 * Restore members from SimplyBook, run locally.
 *
 *   node scripts/restore-members.mjs --dry
 *   node scripts/restore-members.mjs
 *
 * Vercel's Hobby plan caps functions at 60 seconds, and fetching 991 clients
 * plus the invoice scan does not fit. Your laptop has no such limit, so this
 * does the client -> member step directly against SimplyBook and Supabase.
 *
 * Mirrors src/lib/simplybook.ts exactly: same id scheme (m-sb-<sbId>), same
 * qrCode format, same studio-time conversion for joinedAt. Existing members are
 * matched on simplybookId or email and updated rather than duplicated.
 *
 * Writes a timestamped backup of db:members before touching anything.
 */

import fs from "node:fs";
import path from "node:path";
import { target } from "./_target.mjs";

const DRY = process.argv.includes("--dry");

/* ---------- env ---------- */
const T = target({ write: true });
// SimplyBook credentials are the same for either database — it is the source
// of truth, and this script only ever reads from it.
const sb = (() => {
  const out = {};
  for (const f of [".env.development.local", ".env.local"]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && out[m[1]] === undefined) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
  return out;
})();
const env = sb;
const STUDIO_TZ = env.STUDIO_TZ || "Europe/Prague";
const SB_BASE = env.SIMPLYBOOK_API_BASE || "https://user-api-v2.simplybook.it";
const company = env.SIMPLYBOOK_COMPANY;
const { url: SUPA, key: SKEY } = T;

for (const [k, v] of Object.entries({ SIMPLYBOOK_COMPANY: company })) {
  if (!v) {
    console.error(`Missing ${k} in .env.local`);
    process.exit(1);
  }
}

/* ---------- studio-time conversion, same as src/lib/time.ts ---------- */
function studioToISO(local) {
  const s = String(local).trim().replace(" ", "T");
  const naive = new Date(`${s}${s.length === 16 ? ":00" : ""}Z`);
  if (Number.isNaN(naive.getTime())) return new Date(local).toISOString();
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(naive).reduce((a, x) => (x.type !== "literal" ? ((a[x.type] = x.value), a) : a), {});
  const asStudio = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === "24" ? "00" : p.hour), +p.minute, +p.second);
  return new Date(naive.getTime() - (asStudio - naive.getTime())).toISOString();
}

/* ---------- SimplyBook ---------- */
const auth = await fetch(`${SB_BASE}/admin/auth`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ company, login: env.SIMPLYBOOK_LOGIN, password: env.SIMPLYBOOK_USER_KEY }),
});
if (!auth.ok) {
  console.error("SimplyBook auth failed:", auth.status, (await auth.text()).slice(0, 200));
  process.exit(1);
}
const token = (await auth.json()).token;
console.log("SimplyBook auth ok");

async function sbAll(p, maxPages = 50) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = p.includes("?") ? "&" : "?";
    const res = await fetch(`${SB_BASE}${p}${sep}page=${page}&on_page=100`, {
      headers: { "X-Company-Login": company, "X-Token": token, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`${p} page ${page}: ${res.status}`);
    const data = await res.json();
    const rows = Array.isArray(data) ? data : data.data ?? [];
    out.push(...rows);
    process.stdout.write(`\r  fetched ${out.length} clients…`);
    const pages = Array.isArray(data) ? 1 : data.metadata?.pages_count ?? 1;
    if (page >= pages || rows.length === 0) break;
  }
  process.stdout.write("\n");
  return out;
}

const clients = await sbAll("/admin/clients");
console.log(`SimplyBook has ${clients.length} clients`);

/* ---------- Supabase ---------- */
const sHeaders = { apikey: SKEY, Authorization: `Bearer ${SKEY}`, "Content-Type": "application/json" };

async function readCollection(name) {
  const r = await fetch(`${SUPA}/rest/v1/app_state?key=eq.db:${name}&select=value`, { headers: sHeaders });
  if (!r.ok) throw new Error(`read db:${name}: ${r.status}`);
  const rows = await r.json();
  return rows.length && rows[0].value != null ? rows[0].value : [];
}

const existing = await readCollection("members");
console.log(`Supabase currently holds ${existing.length} members`);

// Backup first. Non-negotiable — this script rewrites a whole collection.
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.mkdirSync("backups", { recursive: true });
const backup = `backups/members-${stamp}.json`;
fs.writeFileSync(backup, JSON.stringify(existing, null, 2));
console.log(`Backed up current members -> ${backup}`);

/* ---------- merge, same rules as the sync ---------- */
const members = existing.slice();
let created = 0;
let updated = 0;
let skipped = 0;

for (const c of clients) {
  if (!c.email) {
    skipped++;
    continue;
  }
  const sbId = String(c.id);
  const email = String(c.email).toLowerCase();
  let m = members.find((x) => x.simplybookId === sbId || String(x.email).toLowerCase() === email);

  if (!m) {
    members.push({
      id: `m-sb-${sbId}`,
      name: c.name || c.email,
      email,
      membershipType: "Single Entry",
      membershipExpires: new Date(0).toISOString(), // inactive until a pass says otherwise
      joinedAt: c.registration_date ? studioToISO(c.registration_date) : new Date().toISOString(),
      qrCode: `RXM-${sbId}-${Math.floor(1000 + Math.random() * 9000)}`,
      simplybookId: sbId,
    });
    created++;
  } else {
    m.simplybookId = sbId;
    if (c.name) m.name = c.name;
    if (c.registration_date) {
      const reg = studioToISO(c.registration_date);
      if (new Date(reg).getTime() < new Date(m.joinedAt).getTime()) m.joinedAt = reg;
    }
    updated++;
  }
}

console.log(`\n  ${created} to create, ${updated} to update, ${skipped} skipped (no email)`);
console.log(`  result: ${members.length} members`);
if (members.length) {
  const s = members[members.length - 1];
  console.log(`  sample: ${s.id} | ${s.name} | ${s.email} | joined ${String(s.joinedAt).slice(0, 10)} | ${s.qrCode}`);
}

if (DRY) {
  console.log("\n--dry given, nothing written. Re-run without --dry to apply.");
  process.exit(0);
}

/* ---------- write ---------- */
const res = await fetch(`${SUPA}/rest/v1/app_state?on_conflict=key`, {
  method: "POST",
  headers: { ...sHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify([{ key: "db:members", value: members, updated_at: new Date().toISOString() }]),
});
if (!res.ok) {
  console.error("WRITE FAILED:", res.status, (await res.text()).slice(0, 300));
  console.error(`Your data is still in ${backup}`);
  process.exit(1);
}

// Read it back — a PostgREST upsert reports success even when it changes nothing.
const check = await readCollection("members");
console.log(`\nWrote db:members. Read-back confirms ${check.length} members.`);
console.log(check.length === members.length ? "Restore complete." : "MISMATCH — check Supabase before continuing.");
