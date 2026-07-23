import { getDB, saveDB } from "./store";
import { STUDIO_TZ } from "./time";
import { translate, type Locale, type TranslationKey } from "./i18n";
import { Challenge, CheckIn, Member } from "./types";

const WINDOW_MIN = 30; // minutes before start / after end

export interface CheckInResult {
  ok: boolean;
  message: string;
  className?: string;
  completedChallenges: string[];
  /** rewards unlocked by completions in this check-in, e.g. "🧦 Free grip socks" */
  earnedRewards: string[];
  newBadges: string[];
}

export function membershipActive(m: Member): boolean {
  return new Date(m.membershipExpires).getTime() >= Date.now();
}

/** Full validation chain from the spec:
 *  active membership -> booked class -> inside time window -> not already checked in */
export function performCheckIn(memberId: string, scannedCode: string): CheckInResult {
  const db = getDB();
  const fail = (message: string): CheckInResult => ({
    ok: false,
    message,
    completedChallenges: [],
    earnedRewards: [],
    newBadges: [],
  });

  const member = db.members.find((m) => m.id === memberId);
  if (!member) return fail("Member not found. Please sign in again.");

  const code = scannedCode.trim().toUpperCase();
  if (code !== db.settings.studioCode && code !== "STUDIO")
    return fail("That QR code isn't the studio check-in code.");

  if (!membershipActive(member))
    return fail(
      `Your ${member.membershipType} expired on ${fmtDate(member.membershipExpires)}. Renew at reception to keep your challenges going.`
    );

  const now = Date.now();
  const myBookings = db.bookings.filter((b) => b.memberId === memberId);
  const candidate = myBookings
    .map((b) => db.classes.find((c) => c.id === b.classId)!)
    .filter(Boolean)
    .find((c) => {
      const start = new Date(c.startsAt).getTime();
      const end = start + c.durationMin * 60 * 1000;
      return now >= start - WINDOW_MIN * 60 * 1000 && now <= end + WINDOW_MIN * 60 * 1000;
    });

  if (!candidate)
    return fail(
      "No booked class in the check-in window right now. Check-in opens 30 minutes before your class starts."
    );

  const already = db.checkIns.some((ci) => ci.memberId === memberId && ci.classId === candidate.id);
  if (already) return fail(`You're already checked in for ${candidate.title}. Enjoy the class!`);

  // Record attendance + run all game logic
  const { checkIn, completedChallenges, earnedRewards, newBadges } = recordAttendance(memberId, candidate.id);
  void checkIn;

  saveDB();

  return {
    ok: true,
    message: `Checked in to ${candidate.title}. Have a great class!`,
    className: candidate.title,
    completedChallenges,
    earnedRewards,
    newBadges,
  };
}

/** Insert a check-in and run challenges/badges/rewards. Shared by QR check-in
 *  and the admin's manual check-in (which bypasses code/window validation). */
export function recordAttendance(memberId: string, classId: string) {
  const db = getDB();
  const checkIn: CheckIn = {
    id: `ci-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    memberId,
    classId,
    at: new Date().toISOString(),
  };
  db.checkIns.push(checkIn);

  // Recompute challenges — completing one unlocks its reward
  const completedChallenges: string[] = [];
  const earnedRewards: string[] = [];
  for (const cp of db.challengeProgress.filter((p) => p.memberId === memberId && !p.completedAt)) {
    const ch = db.challenges.find((c) => c.id === cp.challengeId);
    if (!ch || !ch.active) continue;
    cp.progress = computeProgress(memberId, ch);
    if (cp.progress >= ch.goal) {
      cp.completedAt = new Date().toISOString();
      completedChallenges.push(`${ch.emoji} ${ch.name}`);
      const emoji = ch.rewardEmoji ?? "🎁";
      earnedRewards.push(`${emoji} ${ch.reward}`);
      db.earnedRewards.unshift({
        id: `er-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        memberId,
        challengeId: ch.id,
        challengeName: ch.name,
        reward: ch.reward,
        rewardEmoji: emoji,
        earnedAt: new Date().toISOString(),
        status: "earned",
      });
      notifyKey(memberId, "notif.challengeComplete", { challenge: ch.name, reward: ch.reward });
    }
  }

  // Badges
  const newBadges = awardBadges(memberId, checkIn);
  for (const b of newBadges) notifyKey(memberId, "notif.badge", { badge: b });

  return { checkIn, completedChallenges, earnedRewards, newBadges };
}

/** Every class a member has actually taken: past confirmed SimplyBook bookings
 *  plus app QR check-ins, de-duplicated by class and sorted oldest first.
 *  This is the single source of truth for stats, streaks, milestones and
 *  challenge progress — so members see their real history from day one,
 *  not just what happened after the app launched. */
export function attendedClasses(memberId: string): Array<{ classId: string; at: string; scanned: boolean }> {
  const db = getDB();
  const now = Date.now();
  const byClass = new Map<string, { classId: string; at: string; scanned: boolean }>();

  for (const b of db.bookings) {
    if (b.memberId !== memberId) continue;
    const c = db.classes.find((x) => x.id === b.classId);
    if (!c) continue;
    const t = new Date(c.startsAt).getTime();
    if (t >= now) continue; // not taken yet
    byClass.set(c.id, { classId: c.id, at: c.startsAt, scanned: false });
  }
  for (const ci of db.checkIns) {
    if (ci.memberId !== memberId) continue;
    const c = db.classes.find((x) => x.id === ci.classId);
    byClass.set(ci.classId, { classId: ci.classId, at: c?.startsAt ?? ci.at, scanned: true });
  }
  return Array.from(byClass.values()).sort((a, b) => +new Date(a.at) - +new Date(b.at));
}

export function computeProgress(memberId: string, ch: Challenge): number {
  const db = getDB();
  const mine = attendedClasses(memberId);

  switch (ch.type) {
    case "class_count": {
      const s = ch.startDate ? new Date(ch.startDate).getTime() : -Infinity;
      const e = ch.endDate ? new Date(ch.endDate).getTime() : Infinity;
      return mine.filter((a) => {
        const t = new Date(a.at).getTime();
        return t >= s && t <= e;
      }).length;
    }
    case "lifetime_count":
      return mine.length;
    case "instructor_variety": {
      const ids = new Set(
        mine.map((a) => db.classes.find((c) => c.id === a.classId)?.instructorId).filter(Boolean)
      );
      return ids.size;
    }
    case "streak_days":
      return currentStreak(memberId);
    case "monthly_count": {
      const now = new Date();
      return mine.filter((a) => {
        const d = new Date(a.at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length;
    }
    case "referrals":
      return db.members.filter(
        (m) => m.referredBy === memberId && attendedClasses(m.id).length > 0
      ).length;
  }
}

/** All-time bests for the profile "Personal records" section. */
export function personalRecords(memberId: string) {
  const db = getDB();
  const mine = attendedClasses(memberId);

  // longest streak ever
  const days = Array.from(new Set(mine.map((a) => new Date(a.at).setHours(0, 0, 0, 0)))).sort((a, b) => a - b);
  let longest = 0, run = 0, prev = 0;
  for (const d of days) {
    run = prev && d - prev === 86400000 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }

  // best month
  const byMonth: Record<string, number> = {};
  for (const a of mine) {
    const d = new Date(a.at);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    byMonth[k] = (byMonth[k] ?? 0) + 1;
  }
  const best = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0];
  const bestMonthLabel = best
    ? new Date(Number(best[0].split("-")[0]), Number(best[0].split("-")[1])).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : null;

  const earliest = mine
    .map((a) => db.classes.find((c) => c.id === a.classId))
    .filter(Boolean)
    .sort((a, b) => new Date(a!.startsAt).getHours() * 60 + new Date(a!.startsAt).getMinutes() - (new Date(b!.startsAt).getHours() * 60 + new Date(b!.startsAt).getMinutes()))[0];

  return {
    longestStreak: longest,
    bestMonth: best ? { label: bestMonthLabel!, count: best[1] } : null,
    firstClass: mine[0]?.at ?? null,
    earliestClassTime: earliest ? fmtTime(earliest.startsAt) : null,
    referrals: db.members.filter((m) => m.referredBy === memberId && db.checkIns.some((ci) => ci.memberId === m.id)).length,
  };
}

export function currentStreak(memberId: string): number {
  const days = new Set(attendedClasses(memberId).map((a) => new Date(a.at).toDateString()));
  let streak = 0;
  const d = new Date();
  // streak counts today if attended, otherwise starts from yesterday
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function awardBadges(memberId: string, checkIn: CheckIn): string[] {
  const db = getDB();
  const mine = db.checkIns.filter((ci) => ci.memberId === memberId);
  const has = (badgeId: string) =>
    db.earnedBadges.some((b) => b.memberId === memberId && b.badgeId === badgeId);
  const earned: string[] = [];
  const give = (badgeId: string) => {
    if (has(badgeId)) return;
    const def = db.badgeDefs.find((b) => b.id === badgeId);
    if (!def) return;
    db.earnedBadges.push({ memberId, badgeId, earnedAt: new Date().toISOString() });
    earned.push(`${def.emoji} ${def.name}`);
  };

  const total = mine.length;
  if (total >= 1) give("bd-first");
  if (total >= 10) give("bd-10");
  if (total >= 50) give("bd-50");
  if (total >= 100) give("bd-100");

  const cls = db.classes.find((c) => c.id === checkIn.classId);
  if (cls && new Date(cls.startsAt).getHours() < 9) give("bd-early");

  const weekendCount = mine.filter((ci) => {
    const c = db.classes.find((x) => x.id === ci.classId);
    const day = c ? new Date(c.startsAt).getDay() : -1;
    return day === 0 || day === 6;
  }).length;
  if (weekendCount >= 5) give("bd-weekend");

  if (currentStreak(memberId) >= 7) give("bd-streak");

  const member = db.members.find((m) => m.id === memberId);
  if (member && Date.now() - new Date(member.joinedAt).getTime() >= 365 * 24 * 3600 * 1000)
    give("bd-year");

  return earned;
}

export function notify(memberId: string, text: string) {
  const db = getDB();
  db.notifications.unshift({
    id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    memberId,
    text,
    at: new Date().toISOString(),
    read: false,
  });
}

/** Store a message as a translation key so it renders in the member's language.
 *  `text` is kept as an English fallback for older clients and for push. */
export function notifyKey(
  memberId: string,
  key: TranslationKey,
  params?: Record<string, string | number>
) {
  const db = getDB();
  const member = db.members.find((m) => m.id === memberId);
  const locale: Locale = member?.locale ?? "en";
  db.notifications.unshift({
    id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    memberId,
    text: translate(locale, key, params), // fallback + push copy
    key,
    params,
    at: new Date().toISOString(),
    read: false,
  });
}

/** Render a stored notification in the current UI language. */
export function renderNotification(n: { text: string; key?: string; params?: Record<string, string | number> }): string {
  if (!n.key) return n.text;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { cookies } = require("next/headers") as typeof import("next/headers");
    const locale: Locale = cookies().get("rx_lang")?.value === "cs" ? "cs" : "en";
    return translate(locale, n.key as TranslationKey, n.params);
  } catch {
    return n.text;
  }
}

/** The language to use for a member's push message. */
export function memberLocale(memberId: string): Locale {
  return getDB().members.find((m) => m.id === memberId)?.locale ?? "en";
}

/** Lifetime counters shown across the admin console.
 *  attended  = past classes from SimplyBook bookings + any app check-in (deduped)
 *  checkIns  = app QR check-ins only (0 until the app rolls out)
 *  challengesJoined / challengesCompleted = enrolment and completion counts */
export function memberActivity(memberId: string) {
  const db = getDB();
  const now = Date.now();
  const attended = attendedClasses(memberId);
  const mine = db.checkIns.filter((ci) => ci.memberId === memberId);

  const progress = db.challengeProgress.filter((p) => p.memberId === memberId);
  const rewards = db.earnedRewards.filter((r) => r.memberId === memberId);
  const upcoming = db.bookings.filter((b) => {
    if (b.memberId !== memberId) return false;
    const c = db.classes.find((x) => x.id === b.classId);
    return Boolean(c && new Date(c.startsAt).getTime() >= now);
  }).length;

  return {
    attended: attended.length,
    checkIns: mine.length,
    challengesJoined: progress.length,
    challengesCompleted: progress.filter((p) => p.completedAt).length,
    rewardsEarned: rewards.length,
    rewardsCollected: rewards.filter((r) => r.status === "collected").length,
    upcoming,
  };
}

/** What the member's current pass is, and how much of it they've used. */
export function passUsage(memberId: string) {
  const db = getDB();
  const m = db.members.find((x) => x.id === memberId);
  if (!m) return null;

  const active = membershipActive(m);
  const name = m.passName ?? (m.membershipType === "Member" ? "Studio member" : m.membershipType);
  const end = new Date(m.membershipExpires);
  const start = m.passStart ? new Date(m.passStart) : null;
  const unlimited = /unlimit|neomezen/i.test(name);
  const credits = m.passCredits ?? (m.membershipType === "Package 10" ? 10 : undefined);

  // Classes taken inside the current pass period
  const from = start ? start.getTime() : new Date(end.getTime() - 30 * 86400000).getTime();
  const used = attendedClasses(memberId).filter((a) => {
    const t = new Date(a.at).getTime();
    return t >= from && t <= end.getTime();
  }).length;

  const daysLeft = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
  const totalDays = start ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000)) : null;
  const daysUsed = totalDays ? Math.max(0, Math.min(totalDays, totalDays - daysLeft)) : null;

  return {
    active,
    name,
    start: start?.toISOString() ?? null,
    end: m.membershipExpires,
    unlimited,
    credits,
    used,
    remaining: credits ? Math.max(0, credits - used) : null,
    daysLeft,
    totalDays,
    daysUsed,
    /** One line a member instantly understands. */
    summary: !active
      ? "No active pass"
      : credits
      ? `${used} of ${credits} classes used`
      : unlimited && totalDays
      ? `${used} ${used === 1 ? "class" : "classes"} · day ${Math.min(totalDays, (daysUsed ?? 0) + 1)} of ${totalDays}`
      : `${used} ${used === 1 ? "class" : "classes"} this pass`,
  };
}

export function memberStats(memberId: string) {
  const db = getDB();
  const mine = attendedClasses(memberId);
  const total = mine.length;
  const hours = Math.round(
    mine.reduce((acc, a) => {
      const c = db.classes.find((x) => x.id === a.classId);
      return acc + (c ? c.durationMin : 50);
    }, 0) / 60
  );
  const instructorCounts: Record<string, number> = {};
  const hourCounts: Record<number, number> = {};
  for (const a of mine) {
    const c = db.classes.find((x) => x.id === a.classId);
    if (!c) continue;
    instructorCounts[c.instructorId] = (instructorCounts[c.instructorId] ?? 0) + 1;
    const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: STUDIO_TZ, hour: "2-digit", hour12: false }).format(new Date(c.startsAt)));
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  const favInstructorId = Object.entries(instructorCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const favInstructor = db.instructors.find((i) => i.id === favInstructorId)?.name ?? "—";
  const favHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const thisMonth = mine.filter((a) => {
    const d = new Date(a.at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return {
    total,
    hours,
    favInstructor,
    favTime: favHour !== undefined ? `${favHour}:00` : "—",
    streak: currentStreak(memberId),
    thisMonth,
    rewardsCollected: db.earnedRewards.filter((r) => r.memberId === memberId && r.status === "collected").length,
  };
}

export function leaderboard(challengeId?: string) {
  const db = getDB();
  if (challengeId) {
    const ch = db.challenges.find((c) => c.id === challengeId);
    if (!ch) return [];
    return db.challengeProgress
      .filter((p) => p.challengeId === challengeId)
      .map((p) => ({
        name: db.members.find((m) => m.id === p.memberId)?.name ?? "Member",
        value: computeProgress(p.memberId, ch),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }
  // studio-wide: check-ins this month
  const now = new Date();
  const counts: Record<string, number> = {};
  for (const ci of db.checkIns) {
    const d = new Date(ci.at);
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear())
      counts[ci.memberId] = (counts[ci.memberId] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([id, value]) => ({ name: getDB().members.find((m) => m.id === id)?.name ?? "Member", value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

function uiLocale(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { cookies } = require("next/headers") as typeof import("next/headers");
    return cookies().get("rx_lang")?.value === "cs" ? "cs-CZ" : "en-GB";
  } catch {
    return "en-GB";
  }
}

export function fmtDate(isoStr: string) {
  return new Date(isoStr).toLocaleDateString(uiLocale(), {
    timeZone: STUDIO_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
export function fmtTime(isoStr: string) {
  return new Date(isoStr).toLocaleTimeString(uiLocale(), {
    timeZone: STUDIO_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ------------------------------ waitlist ------------------------------ */

/** How long a member has to claim an offered spot before it rolls on. */
const OFFER_WINDOW_MS = 2 * 60 * 60 * 1000;

export function classIsFull(classId: string): boolean {
  const db = getDB();
  const cls = db.classes.find((c) => c.id === classId);
  if (!cls) return false;
  return typeof cls.spotsLeft === "number" && cls.spotsLeft <= 0;
}

export function waitlistFor(classId: string) {
  const db = getDB();
  return (db.waitlist ?? [])
    .filter((w) => w.classId === classId && (w.status === "waiting" || w.status === "offered"))
    .sort((a, b) => +new Date(a.joinedAt) - +new Date(b.joinedAt));
}

/** 1-based queue position, or null when not on the list. */
export function waitlistPosition(memberId: string, classId: string): number | null {
  const q = waitlistFor(classId);
  const i = q.findIndex((w) => w.memberId === memberId);
  return i === -1 ? null : i + 1;
}

export function memberWaitlistEntry(memberId: string, classId: string) {
  return (getDB().waitlist ?? []).find(
    (w) => w.memberId === memberId && w.classId === classId && (w.status === "waiting" || w.status === "offered")
  );
}

/** Offers that are still live for a member — surfaced on the home screen. */
export function pendingOffers(memberId: string) {
  expireStaleOffers();
  const db = getDB();
  const now = Date.now();
  return (db.waitlist ?? [])
    .filter(
      (w) =>
        w.memberId === memberId &&
        w.status === "offered" &&
        (!w.offerExpiresAt || new Date(w.offerExpiresAt).getTime() > now)
    )
    .map((w) => ({ entry: w, cls: db.classes.find((c) => c.id === w.classId) }))
    .filter((x) => x.cls && new Date(x.cls.startsAt).getTime() > now);
}

/** Time out unclaimed offers and pass the spot to the next person. */
export function expireStaleOffers(): number {
  const db = getDB();
  const now = Date.now();
  let expired = 0;
  for (const w of db.waitlist ?? []) {
    if (w.status !== "offered") continue;
    const cls = db.classes.find((c) => c.id === w.classId);
    const classStarted = cls ? new Date(cls.startsAt).getTime() <= now : true;
    const windowPassed = w.offerExpiresAt ? new Date(w.offerExpiresAt).getTime() <= now : false;
    if (windowPassed || classStarted) {
      w.status = "expired";
      expired++;
      if (!classStarted) offerNextSpot(w.classId);
    }
  }
  if (expired) saveDB();
  return expired;
}

/** Offer a freed spot to whoever is first in line. Never books automatically —
 *  the member has to confirm, so nobody is charged a class they can't attend. */
export function offerNextSpot(classId: string): boolean {
  const db = getDB();
  const cls = db.classes.find((c) => c.id === classId);
  if (!cls) return false;
  const startsAt = new Date(cls.startsAt).getTime();
  if (startsAt <= Date.now()) return false;

  const queue = waitlistFor(classId);
  if (queue.some((w) => w.status === "offered")) return false; // one live offer at a time
  const next = queue.find((w) => w.status === "waiting");
  if (!next) return false;

  next.status = "offered";
  next.offeredAt = new Date().toISOString();
  // Never let an offer outlive the class itself
  next.offerExpiresAt = new Date(Math.min(Date.now() + OFFER_WINDOW_MS, startsAt)).toISOString();

  const when = new Date(cls.startsAt).toLocaleString("en-GB", {
    timeZone: STUDIO_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  notifyKey(next.memberId, "notif.waitOffer", { title: cls.title, when });
  saveDB();
  return true;
}
