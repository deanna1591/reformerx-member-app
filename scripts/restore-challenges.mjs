/**
 * Restore the eight challenges' reward text, descriptions and dates.
 *
 *   node scripts/restore-challenges.mjs --dry
 *   node scripts/restore-challenges.mjs
 *
 * The rows themselves came back via the sync, but reward text lived only in the
 * database and the Free plan has no backups. These values are transcribed from
 * the /admin/challenges screenshot taken before the reset, remapped onto the
 * corrected rule types.
 *
 * Only touches the fields listed below — id, type, goal and windowDays are left
 * exactly as the sync seeded them.
 */

import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry");

const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const SUPA = (env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPA || !KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

/* Recovered values, keyed by the current challenge ids. */
const RESTORE = {
  "ch-first-30": {
    emoji: "🌱",
    description: "Your first thirty classes at ReformerX.",
    reward: "Sephora Gift Card",
    leaderboard: true,
    active: true,
  },
  "ch-10in30": {
    emoji: "🏆",
    description: "Complete 10 classes within 30 days and earn a pair of RX grip socks.",
    reward: "Free grip socks",
    leaderboard: false,
    active: true,
  },
  "ch-7in7": {
    emoji: "⚡",
    // Rewritten: the rule is now 7 classes in 7 days, not 7 consecutive days.
    description: "Seven classes in seven days.",
    reward: "Free class credit",
    leaderboard: false,
    active: true,
  },
  "ch-first-100": {
    emoji: "💯",
    description: "A lifetime achievement. One hundred classes at ReformerX.",
    reward: "Exclusive RX tote + member event invite",
    leaderboard: true,
    active: true,
  },
  "ch-seasonal": {
    emoji: "☀️",
    description:
      "20 classes during the campaign window. Top of the leaderboard wins a month of Unlimited.",
    reward: "1 month Unlimited (leaderboard winner)",
    startDate: "2026-07-01",
    endDate: "2026-08-31",
    leaderboard: true,
    active: true,
  },
  "ch-friend": {
    emoji: "👯",
    description:
      "Share your member code. When a friend joins with it and takes their first class, a guest pass is yours.",
    reward: "Guest pass",
    leaderboard: false,
    active: true,
  },
  "ch-monthly-rhythm": {
    emoji: "🗓️",
    description: "Eight classes this calendar month. Resets on the 1st — a fresh smoothie every month you hit it.",
    reward: "Protein smoothie",
    leaderboard: false,
    active: true,
  },
  "ch-every-coach": {
    emoji: "🤝",
    description: "Take at least one class with every ReformerX instructor.",
    reward: "Coffee & smoothie voucher",
    leaderboard: false,
    active: true,
  },
};

/* ---------- read ---------- */
const res = await fetch(`${SUPA}/rest/v1/app_state?key=eq.db:challenges&select=value`, { headers });
if (!res.ok) {
  console.error("read failed:", res.status, (await res.text()).slice(0, 200));
  process.exit(1);
}
const rows = await res.json();
const challenges = rows.length && Array.isArray(rows[0].value) ? rows[0].value : [];
console.log(`db:challenges holds ${challenges.length} rows`);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.mkdirSync("backups", { recursive: true });
const backup = `backups/challenges-${stamp}.json`;
fs.writeFileSync(backup, JSON.stringify(challenges, null, 2));
console.log(`Backed up -> ${backup}\n`);

/* ---------- patch ---------- */
let patched = 0;
const missing = [];
for (const [id, fields] of Object.entries(RESTORE)) {
  const ch = challenges.find((c) => c.id === id);
  if (!ch) {
    missing.push(id);
    continue;
  }
  Object.assign(ch, fields);
  patched++;
  const dates = ch.startDate ? ` ${ch.startDate}..${ch.endDate}` : "";
  console.log(
    `  ${ch.emoji} ${String(ch.name).padEnd(24)} ${String(ch.type).padEnd(18)} goal=${String(ch.goal).padEnd(4)} ${ch.active ? "LIVE " : "draft"} ${ch.leaderboard ? "🏆" : "  "} ${ch.reward}${dates}`
  );
}
if (missing.length) console.log(`\n  not found, skipped: ${missing.join(", ")}`);
console.log(`\n${patched} of ${Object.keys(RESTORE).length} restored`);

if (DRY) {
  console.log("\n--dry given, nothing written.");
  process.exit(0);
}

/* ---------- write + verify ---------- */
const put = await fetch(`${SUPA}/rest/v1/app_state?on_conflict=key`, {
  method: "POST",
  headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify([{ key: "db:challenges", value: challenges, updated_at: new Date().toISOString() }]),
});
if (!put.ok) {
  console.error("WRITE FAILED:", put.status, (await put.text()).slice(0, 300));
  console.error(`Previous state is in ${backup}`);
  process.exit(1);
}

const back = await fetch(`${SUPA}/rest/v1/app_state?key=eq.db:challenges&select=value`, { headers });
const after = (await back.json())[0]?.value ?? [];
const live = after.filter((c) => c.active).length;
const rewarded = after.filter((c) => c.reward).length;
console.log(`\nWrote db:challenges. Read-back: ${after.length} rows, ${live} live, ${rewarded} with rewards.`);
