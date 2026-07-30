/**
 * Repair unparseable sentAt values in the email log.
 *
 *   node scripts/repair-emaillog-dates.mjs --dry
 *   node scripts/repair-emaillog-dates.mjs --prod
 *
 * The Resend CSV import wrote timestamps like "2026-07-30T09:10:06.49+00" — a
 * two-digit offset, which Date() rejects. Intl.DateTimeFormat throws on an
 * Invalid Date, so those rows returned a 500 for the whole /admin/email page.
 *
 * Only touches rows that fail to parse; valid ones are left exactly as they are.
 */
import fs from "node:fs";
import { target } from "./_target.mjs";

const DRY = process.argv.includes("--dry");
const T = target({ write: !DRY });

const read = async (name) => {
  const r = await fetch(`${T.url}/rest/v1/app_state?key=eq.db:${name}&select=value`, { headers: T.headers });
  const rr = await r.json();
  return rr.length && rr[0].value != null ? rr[0].value : [];
};

const log = await read("emailLog");
console.log(`db:emailLog holds ${log.length} rows`);

const bad = log.filter((e) => Number.isNaN(new Date(e.sentAt).getTime()));
console.log(`  ${bad.length} with an unparseable sentAt`);
if (bad.length) console.log(`  example: ${JSON.stringify(bad[0].sentAt)}`);

if (bad.length === 0) {
  console.log("\nNothing to repair.");
  process.exit(0);
}

let fixed = 0;
let fellBack = 0;
for (const e of log) {
  if (!Number.isNaN(new Date(e.sentAt).getTime())) continue;
  // "2026-07-30T09:10:06.49+00" -> add the missing minutes to the offset
  const candidate = String(e.sentAt).trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(candidate);
  if (!Number.isNaN(d.getTime())) {
    e.sentAt = d.toISOString();
    fixed++;
  } else {
    // Unrecoverable: keep the row so the member is still skipped, and date it
    // now. Losing the exact time is far better than re-emailing them.
    e.sentAt = new Date().toISOString();
    fellBack++;
  }
}
console.log(`  ${fixed} recovered from the original value, ${fellBack} dated now as a fallback`);

if (DRY) {
  console.log("\n--dry given, nothing written.");
  process.exit(0);
}

fs.mkdirSync("backups", { recursive: true });
fs.writeFileSync(`backups/emailLog-broken-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, JSON.stringify(bad, null, 2));

const res = await fetch(`${T.url}/rest/v1/app_state?on_conflict=key`, {
  method: "POST",
  headers: { ...T.headers, Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify([{ key: "db:emailLog", value: log, updated_at: new Date().toISOString() }]),
});
if (!res.ok) {
  console.error("WRITE FAILED:", res.status, (await res.text()).slice(0, 300));
  process.exit(1);
}

const after = await read("emailLog");
const stillBad = after.filter((e) => Number.isNaN(new Date(e.sentAt).getTime())).length;
console.log(`\nWrote ${after.length} rows. ${stillBad} still unparseable.`);
console.log(stillBad === 0 ? "Every timestamp is valid." : "SOME STILL BAD — do not rely on the page yet.");
