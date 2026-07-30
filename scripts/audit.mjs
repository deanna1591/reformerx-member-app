/**
 * Health check across everything today's work touched.
 *
 *   node scripts/audit.mjs --prod
 *   node scripts/audit.mjs            # dev copy
 *
 * Read-only. Checks the invariants rather than asserting things are fine:
 * duplicate or unknown challenges, orphaned progress and bookings, images still
 * inline in the database, instructor flags, and sync freshness.
 */
import { target } from "./_target.mjs";

const T = target({ write: false });
const read = async (name) => {
  const r = await fetch(`${T.url}/rest/v1/app_state?key=eq.db:${name}&select=value`, { headers: T.headers });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows.length && rows[0].value != null ? rows[0].value : [];
};

const db = {};
for (const k of ["members", "bookings", "classes", "challenges", "challengeProgress", "badgeDefs",
                 "earnedBadges", "instructors", "promotions", "checkIns", "settings", "packages"]) {
  db[k] = await read(k);
}

let problems = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => { problems++; console.log(`  FAIL  ${m}`); };
const note = (m) => console.log(`        ${m}`);

console.log("\nCHALLENGES");
const STUDIO = ["ch-first-30", "ch-10in30", "ch-7in7", "ch-first-100", "ch-seasonal",
                "ch-friend", "ch-monthly-rhythm", "ch-every-coach"];
const ids = db.challenges.map((c) => c.id);
const extra = ids.filter((i) => !STUDIO.includes(i));
const missing = STUDIO.filter((i) => !ids.includes(i));
missing.length ? bad(`missing: ${missing.join(", ")}`) : ok("all 8 studio challenges present");
extra.length ? bad(`${extra.length} extra: ${extra.join(", ")}`) : ok("no extra challenges");
const noReward = db.challenges.filter((c) => !c.reward);
noReward.length ? bad(`${noReward.length} with no reward: ${noReward.map((c) => c.name).join(", ")}`)
                : ok("every challenge has a reward");
const dupNames = Object.entries(db.challenges.reduce((a, c) => ((a[c.name] = (a[c.name] ?? 0) + 1), a), {}))
  .filter(([, n]) => n > 1);
dupNames.length ? bad(`duplicate names: ${dupNames.map(([n]) => n).join(", ")}`) : ok("no duplicate names");
note(`${db.challenges.filter((c) => c.active).length} live, ${db.challenges.filter((c) => !c.active).length} paused`);

console.log("\nCHALLENGE PROGRESS");
const liveIds = new Set(ids);
const orphanProg = db.challengeProgress.filter((p) => !liveIds.has(p.challengeId));
orphanProg.length
  ? bad(`${orphanProg.length} row(s) point at missing challenges: ${[...new Set(orphanProg.map((p) => p.challengeId))].join(", ")}` +
        " — run remap-progress.mjs, or clear them if you are re-adding by hand")
  : ok("all progress rows attached to a live challenge");

console.log("\nINSTRUCTORS");
const acts = db.instructors.filter((i) => i.isActivity);
const alias = db.instructors.filter((i) => i.sameAs);
const coaches = db.instructors.filter((i) => !i.isActivity && !i.sameAs);
ok(`${coaches.length} coaches, ${acts.length} activities, ${alias.length} aliases`);
const badAlias = alias.filter((i) => !db.instructors.some((x) => x.id === i.sameAs));
badAlias.length ? bad(`alias points nowhere: ${badAlias.map((i) => i.id).join(", ")}`) : ok("aliases resolve");
const coachCh = db.challenges.find((c) => c.type === "instructor_variety");
if (coachCh) {
  const from = Date.now() - 90 * 86400000;
  const actIds = new Set(acts.map((i) => i.id));
  const canon = (id) => db.instructors.find((i) => i.id === id)?.sameAs ?? id;
  const teaching = new Set(db.classes
    .filter((c) => c.instructorId && !actIds.has(c.instructorId) && new Date(c.startsAt).getTime() >= from)
    .map((c) => canon(c.instructorId)));
  note(`"${coachCh.name}" target resolves to ${Math.max(1, teaching.size)}`);
}

console.log("\nIMAGES");
for (const [coll, field] of [["instructors", "photoUrl"], ["promotions", "imageUrl"], ["badgeDefs", "imageUrl"]]) {
  const inline = (db[coll] ?? []).filter((r) => typeof r[field] === "string" && r[field].startsWith("data:"));
  inline.length ? bad(`${coll}: ${inline.length} image(s) still inline in the database`)
                : ok(`${coll}: no inline images`);
}

console.log("\nREFERENTIAL");
const memberIds = new Set(db.members.map((m) => m.id));
const classIds = new Set(db.classes.map((c) => c.id));
const badgeIds = new Set(db.badgeDefs.map((b) => b.id));
const bOrphanM = db.bookings.filter((b) => !memberIds.has(b.memberId)).length;
const bOrphanC = db.bookings.filter((b) => !classIds.has(b.classId)).length;
// SimplyBook clients with no email address never become members, so their
// bookings have nothing to point at. Expected, not a fault.
bOrphanM > 50
  ? bad(`${bOrphanM} booking(s) reference a missing member — too many to be email-less clients`)
  : bOrphanM
    ? note(`${bOrphanM} booking(s) belong to SimplyBook clients with no email (expected)`)
    : ok("bookings -> members intact");
bOrphanC ? note(`${bOrphanC} booking(s) reference a class outside the synced window (expected)`) : ok("bookings -> classes intact");
if (db.badgeDefs.length === 0) {
  // Built-in definitions live in code and are re-seeded on every load, so an
  // empty stored row is only a problem once badgeDefs is a persisted collection.
  note("badgeDefs not stored yet — built-ins come from code, so earned badges still resolve");
} else {
  const eb = db.earnedBadges.filter((b) => !badgeIds.has(b.badgeId)).length;
  eb ? bad(`${eb} earned badge(s) reference a missing definition`) : ok("earned badges -> definitions intact");
}

console.log("\nSCALE");
note(`${db.members.length} members · ${db.bookings.length} bookings · ${db.classes.length} classes`);
note(`${db.earnedBadges.length} earned badges · ${db.badgeDefs.length} definitions · ${db.checkIns.length} check-ins`);
note(`${db.packages.length} packages`);

console.log("\nSYNC");
const last = db.settings?.lastSync;
if (!last) bad("no lastSync recorded");
else {
  const ts = new Date(last.split("|")[0]);
  const mins = Math.round((Date.now() - ts.getTime()) / 60000);
  mins > 120 ? bad(`last sync was ${mins} min ago — the cron may not be running`)
             : ok(`last sync ${mins} min ago`);
}

console.log(`\n${problems === 0 ? "No problems found." : `${problems} problem(s) found.`}\n`);
process.exit(problems === 0 ? 0 : 1);
