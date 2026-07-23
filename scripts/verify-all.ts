/* Full verification of ReformerX business logic.
   Runs against a scratch database — does not touch SimplyBook.
   npx tsx scripts/verify-all.ts */

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    failed++;
    failures.push(`${label} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    console.log(`  FAIL  ${label}  (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  }
}

const day = 86400000;
const at = (offsetDays: number, hour = 9) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

async function main() {
  // Deliberately no saveDB import: this suite wipes the database for its
  // fixtures, so it must never be able to persist anything anywhere.
  const { getDB } = await import("../src/lib/store");
  const engine = await import("../src/lib/engine");
  const { translate, LOCALES } = await import("../src/lib/i18n");
  const { studioToISO, isoToStudioString, studioDayKey } = await import("../src/lib/time");

  const db = getDB();
  // clean slate
  db.members = [];
  db.classes = [];
  db.bookings = [];
  db.checkIns = [];
  db.challenges = [];
  db.challengeProgress = [];
  db.earnedBadges = [];
  db.earnedRewards = [];
  db.notifications = [];
  db.waitlist = [];
  db.instructors = [
    { id: "i-a", name: "Coach A", role: "Instructor" },
    { id: "i-b", name: "Coach B", role: "Instructor" },
    { id: "i-c", name: "Coach C", role: "Instructor" },
  ];

  const member = (id: string, extra: Partial<(typeof db.members)[number]> = {}) => {
    const m = {
      id,
      name: `Member ${id}`,
      email: `${id}@test.cz`,
      qrCode: `RXM-${id.toUpperCase()}`,
      membershipType: "Unlimited" as const,
      membershipExpires: at(30),
      joinedAt: at(-200),
      passName: "Monthly Unlimited",
      passStart: at(-10),
      ...extra,
    };
    db.members.push(m);
    return m;
  };
  const cls = (id: string, offsetDays: number, hour: number, instructorId = "i-a", capacity?: number) => {
    db.classes.push({ id, title: `Class ${id}`, instructorId, startsAt: at(offsetDays, hour), durationMin: 50, capacity });
    return id;
  };
  const book = (memberId: string, classId: string) =>
    db.bookings.push({ id: `b-${memberId}-${classId}`, memberId, classId, source: "simplybook" });

  /* ============ 1. TIMEZONE ============ */
  console.log("\n1. TIMEZONE (studio time, not server time)");
  check("07:15 Prague stores as 05:15 UTC in summer", studioToISO("2026-07-23 07:15:00"), "2026-07-23T05:15:00.000Z");
  check("round-trips back to wall clock", isoToStudioString("2026-07-23T05:15:00.000Z"), "2026-07-23 07:15:00");
  check("00:30 Prague stays on the same calendar day", studioDayKey(studioToISO("2026-07-23 00:30:00")), "2026-07-23");
  check("winter offset handled (Jan is +1, not +2)", studioToISO("2026-01-15 08:00:00"), "2026-01-15T07:00:00.000Z");

  /* ============ 2. ATTENDANCE ============ */
  console.log("\n2. ATTENDANCE (SimplyBook history + app check-ins, deduped)");
  member("att");
  cls("c-past1", -5, 9);
  cls("c-past2", -3, 9);
  cls("c-future", 5, 9);
  book("att", "c-past1");
  book("att", "c-past2");
  book("att", "c-future");
  check("past bookings count, future do not", engine.attendedClasses("att").length, 2);
  db.checkIns.push({ id: "ci1", memberId: "att", classId: "c-past1", at: at(-5, 9) });
  check("a check-in on an already-counted class is not double counted", engine.attendedClasses("att").length, 2);
  cls("c-scan", -1, 9);
  db.checkIns.push({ id: "ci2", memberId: "att", classId: "c-scan", at: at(-1, 9) });
  check("a check-in without a booking still counts", engine.attendedClasses("att").length, 3);

  /* ============ 3. CHALLENGE TYPES ============ */
  console.log("\n3. CHALLENGE PROGRESS (all six types)");
  member("ch");
  cls("cc1", -1, 9, "i-a");
  cls("cc2", -2, 9, "i-a");
  cls("cc3", -3, 9, "i-b");
  cls("cc4", -8, 9, "i-c");
  cls("cc5", -40, 9, "i-a");
  for (const c of ["cc1", "cc2", "cc3", "cc4", "cc5"]) book("ch", c);
  const mk = (type: string, goal: number, extra = {}) =>
    ({ id: `t-${type}`, name: type, emoji: "x", description: "", type, goal, reward: "r", springColor: "red", leaderboard: false, active: true, ...extra }) as never;
  check("class_count inside a 30-day window", engine.computeProgress("ch", mk("class_count", 10, { startDate: at(-30), endDate: at(1) })), 4);
  check("class_count outside the window is zero", engine.computeProgress("ch", mk("class_count", 10, { startDate: at(5), endDate: at(10) })), 0);
  check("lifetime_count counts everything", engine.computeProgress("ch", mk("lifetime_count", 100)), 5);
  check("instructor_variety counts distinct coaches", engine.computeProgress("ch", mk("instructor_variety", 5)), 3);
  check("streak_days finds the 3-day run", engine.computeProgress("ch", mk("streak_days", 7)), 3);
  const thisMonth = engine.attendedClasses("ch").filter((a) => new Date(a.at).getMonth() === new Date().getMonth()).length;
  check("monthly_count matches classes this month", engine.computeProgress("ch", mk("monthly_count", 12)), thisMonth);

  /* ============ 4. REFERRALS ============ */
  console.log("\n4. REFERRALS (only count once the friend actually attends)");
  member("ref");
  member("friend", { referredBy: "ref" });
  check("referral pending before the friend attends", engine.computeProgress("ref", mk("referrals", 1)), 0);
  cls("c-friend", -2, 9);
  book("friend", "c-friend");
  check("referral counts after their first class", engine.computeProgress("ref", mk("referrals", 1)), 1);

  /* ============ 5. PASS USAGE ============ */
  console.log("\n5. PASSES");
  member("unl", { passName: "Monthly Unlimited", membershipExpires: at(14) });
  const unlPass = engine.passUsage("unl");
  check("unlimited pass detected", unlPass?.unlimited, true);
  check("unlimited has no credit ceiling", unlPass?.credits ?? null, null);
  member("pack", { membershipType: "Package 10", passName: "Package 10", passCredits: 10, membershipExpires: at(40) });
  cls("cp1", -2, 9);
  cls("cp2", -1, 9);
  book("pack", "cp1");
  book("pack", "cp2");
  const packPass = engine.passUsage("pack");
  check("pack counts classes used in the pass period", packPass?.used, 2);
  check("pack reports credits remaining", packPass?.remaining, 8);
  member("exp", { membershipExpires: at(-1) });
  check("expired pass is inactive", engine.membershipActive(db.members.find((m) => m.id === "exp")!), false);

  /* ============ 6. BOOKING RULES ============ */
  console.log("\n6. BOOKING ELIGIBILITY");
  check("expired member cannot book", engine.canBook("exp").reason, "no_pass");
  check("unlimited member can book", engine.canBook("unl").reason, "ok");
  member("credits0", { membershipType: "Package 10", passName: "Package 10", passCredits: 2, membershipExpires: at(40) });
  cls("cx1", -2, 9);
  cls("cx2", -1, 9);
  book("credits0", "cx1");
  book("credits0", "cx2");
  check("pack with no credits left is blocked", engine.canBook("credits0").reason, "no_credits");
  member("packfuture", { membershipType: "Package 10", passName: "Package 10", passCredits: 2, membershipExpires: at(40) });
  cls("cf1", 2, 9);
  cls("cf2", 3, 9);
  book("packfuture", "cf1");
  book("packfuture", "cf2");
  check("upcoming bookings also consume credits", engine.canBook("packfuture").reason, "no_credits");

  console.log("\n7. ONE CLASS PER DAY (unlimited passes only)");
  member("daily", { passName: "Monthly Unlimited", membershipExpires: at(30) });
  const dAm = cls("d-am", 3, 8);
  const dPm = cls("d-pm", 3, 18);
  const dNext = cls("d-next", 4, 8);
  book("daily", dAm);
  check("second class the same day is blocked", engine.canBook("daily", dPm).reason, "daily_limit");
  check("next day is fine", engine.canBook("daily", dNext).reason, "ok");
  check("rescheduling within the same day is allowed", engine.canBook("daily", dPm, dAm).reason, "ok");
  member("dailypack", { membershipType: "Package 10", passName: "Package 10", passCredits: 10, membershipExpires: at(40) });
  book("dailypack", dAm);
  check("credit packs are not day-limited", engine.canBook("dailypack", dPm).reason, "ok");

  /* ============ 8. CAPACITY & WAITLIST ============ */
  console.log("\n8. CAPACITY AND WAITLIST");
  const full = cls("w-full", 2, 10, "i-a", 2);
  db.classes.find((c) => c.id === full)!.spotsLeft = 0;
  check("class at capacity reports full", engine.classIsFull(full), true);
  const open = cls("w-open", 2, 12, "i-a", 8);
  db.classes.find((c) => c.id === open)!.spotsLeft = 5;
  check("class with spots is not full", engine.classIsFull(open), false);
  const noLimit = cls("w-nolimit", 2, 14, "i-a");
  check("class without a capacity is never full", engine.classIsFull(noLimit), false);

  member("w1");
  member("w2");
  member("w3");
  db.waitlist = [
    { id: "wl1", memberId: "w1", classId: full, joinedAt: at(0, 1), status: "waiting" },
    { id: "wl2", memberId: "w2", classId: full, joinedAt: at(0, 2), status: "waiting" },
    { id: "wl3", memberId: "w3", classId: full, joinedAt: at(0, 3), status: "waiting" },
  ];
  check("queue keeps join order", engine.waitlistFor(full).map((w) => w.memberId), ["w1", "w2", "w3"]);
  check("position is 1-based", engine.waitlistPosition("w2", full), 2);
  check("offer goes to the first in line", engine.offerNextSpot(full), true);
  check("offered member is w1", db.waitlist.find((w) => w.status === "offered")?.memberId, "w1");
  check("only one live offer at a time", engine.offerNextSpot(full), false);
  check("the offer is visible to w1", engine.pendingOffers("w1").length, 1);
  check("and not to w2", engine.pendingOffers("w2").length, 0);
  const offer = db.waitlist.find((w) => w.status === "offered")!;
  offer.offerExpiresAt = new Date(Date.now() - 1000).toISOString();
  check("stale offer expires", engine.expireStaleOffers(), 1);
  check("and rolls to w2", db.waitlist.find((w) => w.status === "offered")?.memberId, "w2");
  const pastFull = cls("w-past", -1, 10, "i-a", 1);
  db.waitlist.push({ id: "wl4", memberId: "w3", classId: pastFull, joinedAt: at(0), status: "waiting" });
  check("no offers for classes that already ran", engine.offerNextSpot(pastFull), false);

  /* ============ 9. RENEWALS ============ */
  console.log("\n9. RENEWAL REMINDERS");
  db.notifications = [];
  member("ren-soon", { membershipExpires: at(2) });
  member("ren-later", { membershipExpires: at(20) });
  const first = engine.sendRenewalReminders();
  check("only members expiring inside the window are nudged", first.sent >= 1, true);
  check("a member expiring in 20 days is left alone", db.notifications.some((n) => n.memberId === "ren-later"), false);
  const second = engine.sendRenewalReminders();
  check("nobody is nudged twice for the same pass", second.sent, 0);

  /* ============ 10. PASS OVERVIEW ============ */
  console.log("\n10. PASS OVERVIEW (admin)");
  const overview = engine.passOverview();
  check("groups active members by product", overview.groups.length > 0, true);
  check("total matches the sum of the groups", overview.totalActive, overview.groups.reduce((n, g) => n + g.count, 0));
  check("expiring-soon count is populated", typeof overview.expiringSoon, "number");

  /* ============ 11. TRANSLATIONS ============ */
  console.log("\n11. TRANSLATIONS");
  const enKeys = Object.keys((await import("../src/lib/i18n")) as never);
  const sample = ["nav.home", "schedule.title", "class.cancelBooking", "wait.joinFull", "store.title", "adm.pass.title", "install.title"] as const;
  let missingCs = 0;
  for (const k of sample) {
    const en = translate("en", k);
    const cs = translate("cs", k);
    if (!cs || cs === en) missingCs++;
  }
  check("Czech differs from English across sampled keys", missingCs, 0);
  check("both locales registered", LOCALES, ["en", "cs"]);
  check("placeholders are substituted", translate("en", "miles.toGo", { n: 5 }).includes("5"), true);

  /* ============ 12. CHECK-IN RULES ============ */
  console.log("\n12. QR CHECK-IN");
  db.settings.studioCode = "RX-STUDIO-CHECKIN";
  member("ci", { membershipExpires: at(30) });
  const soon = cls("ci-now", 0, new Date().getHours());
  book("ci", soon);
  const wrongCode = engine.performCheckIn("ci", "WRONG-CODE");
  check("a wrong studio code is rejected", wrongCode.ok, false);
  member("ci-expired", { membershipExpires: at(-2) });
  const expiredResult = engine.performCheckIn("ci-expired", db.settings.studioCode);
  check("an expired member cannot check in", expiredResult.ok, false);

  console.log("\n" + "=".repeat(64));
  console.log(`${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log("  - " + f);
  }
  console.log("=".repeat(64));
  process.exit(failed > 0 ? 1 : 0);
}

main();
