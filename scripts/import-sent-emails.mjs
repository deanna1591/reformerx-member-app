/**
 * Backfill the email log from a Resend CSV export.
 *
 *   node scripts/import-sent-emails.mjs <export.csv> "<subject>" --dry
 *   node scripts/import-sent-emails.mjs <export.csv> "<subject>" --prod
 *
 * The log was added after the first broadcast went out, so those recipients
 * aren't recorded and would be emailed a second time when the campaign is
 * continued. Resend's export has the addresses; this matches them to members.
 *
 * Bounced addresses are logged too. They never received it, but re-sending to a
 * dead address only burns quota and repeated bounces damage sender reputation —
 * better to fix the address than retry it.
 */
import fs from "node:fs";
import { target } from "./_target.mjs";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [csvPath, subject] = args;
const DRY = process.argv.includes("--dry");

if (!csvPath || !subject) {
  console.error('Usage: node scripts/import-sent-emails.mjs <export.csv> "<subject>" [--dry|--prod]');
  process.exit(1);
}
if (!fs.existsSync(csvPath)) {
  console.error(`No such file: ${csvPath}`);
  process.exit(1);
}

const T = target({ write: !DRY });

/** Minimal CSV reader — handles quoted fields, which Resend's export uses. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

/**
 * Resend writes "2026-07-30 09:10:06.49+00" — a space instead of T, and a
 * two-digit offset. Date() rejects both, and an Invalid Date stored in the log
 * made Intl throw and took the admin page down. Normalise, then verify.
 */
function toIso(raw) {
  const fallback = new Date().toISOString();
  if (!raw) return fallback;
  const candidate = String(raw).trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(candidate);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

const all = parseCsv(fs.readFileSync(csvPath, "utf8"));
const rows = all.filter((r) => r.subject === subject);
if (rows.length === 0) {
  console.error(`No rows with subject "${subject}". Subjects present:`);
  for (const s of new Set(all.map((r) => r.subject))) console.error(`  ${s}`);
  process.exit(1);
}
console.log(`\n${rows.length} row(s) for "${subject}"`);
const byEvent = rows.reduce((a, r) => ((a[r.last_event] = (a[r.last_event] ?? 0) + 1), a), {});
console.log("  " + Object.entries(byEvent).map(([k, v]) => `${v} ${k}`).join(", "));

const read = async (name) => {
  const r = await fetch(`${T.url}/rest/v1/app_state?key=eq.db:${name}&select=value`, { headers: T.headers });
  const rr = await r.json();
  return rr.length && rr[0].value != null ? rr[0].value : [];
};

const members = await read("members");
const log = await read("emailLog");
const byEmail = new Map(members.map((m) => [String(m.email).toLowerCase(), m]));

const alreadyLogged = new Set(log.filter((e) => e.subject === subject).map((e) => e.memberId));
const additions = [];
const unmatched = [];
const bounced = [];

for (const r of rows) {
  const email = String(r.to).trim().toLowerCase();
  if (r.last_event === "bounced") bounced.push(email);
  const m = byEmail.get(email);
  if (!m) { unmatched.push(email); continue; }
  if (alreadyLogged.has(m.id)) continue;
  alreadyLogged.add(m.id);
  additions.push({ subject, memberId: m.id, sentAt: toIso(r.sent_at || r.created_at) });
}

console.log(`\n  ${additions.length} to add to the log`);
if (unmatched.length) {
  console.log(`  ${unmatched.length} address(es) match no member:`);
  for (const e of unmatched) console.log(`      ${e}`);
}
if (bounced.length) {
  console.log(`  ${bounced.length} bounced — worth correcting in SimplyBook:`);
  for (const e of bounced) console.log(`      ${e}`);
}

const outstanding = members.filter(
  (m) => m.email && m.email.includes("@") && !m.email.endsWith("@example.invalid") && !alreadyLogged.has(m.id)
).length;
console.log(`\n  after this: ${outstanding} member(s) still to receive it`);

if (DRY) {
  console.log("\n--dry given, nothing written.");
  process.exit(0);
}

fs.mkdirSync("backups", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.writeFileSync(`backups/emailLog-${stamp}.json`, JSON.stringify(log, null, 2));

const next = [...log, ...additions];
const res = await fetch(`${T.url}/rest/v1/app_state?on_conflict=key`, {
  method: "POST",
  headers: { ...T.headers, Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify([{ key: "db:emailLog", value: next, updated_at: new Date().toISOString() }]),
});
if (!res.ok) {
  console.error("WRITE FAILED:", res.status, (await res.text()).slice(0, 300));
  process.exit(1);
}
const after = await read("emailLog");
console.log(`\nWrote db:emailLog — ${after.length} rows, ${after.filter((e) => e.subject === subject).length} for this campaign.`);
