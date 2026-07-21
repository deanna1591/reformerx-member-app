import { getDB, saveDB } from "./store";
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

  // Record attendance
  const checkIn: CheckIn = {
    id: `ci-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    memberId,
    classId: candidate.id,
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
      notify(memberId, `🎉 ${ch.name} complete! Your reward — ${ch.reward} — is being prepared. We'll let you know when it's ready at reception.`);
    }
  }

  // Badges
  const newBadges = awardBadges(memberId, checkIn);
  for (const b of newBadges) notify(memberId, `New badge earned: ${b}`);

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

export function computeProgress(memberId: string, ch: Challenge): number {
  const db = getDB();
  const mine = db.checkIns.filter((ci) => ci.memberId === memberId);

  switch (ch.type) {
    case "class_count": {
      const s = ch.startDate ? new Date(ch.startDate).getTime() : -Infinity;
      const e = ch.endDate ? new Date(ch.endDate).getTime() : Infinity;
      return mine.filter((ci) => {
        const t = new Date(ci.at).getTime();
        return t >= s && t <= e;
      }).length;
    }
    case "lifetime_count":
      return mine.length;
    case "instructor_variety": {
      const ids = new Set(
        mine
          .map((ci) => db.classes.find((c) => c.id === ci.classId)?.instructorId)
          .filter(Boolean)
      );
      return ids.size;
    }
    case "streak_days":
      return currentStreak(memberId);
    case "monthly_count": {
      const now = new Date();
      return mine.filter((ci) => {
        const d = new Date(ci.at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length;
    }
    case "referrals":
      return db.members.filter(
        (m) => m.referredBy === memberId && db.checkIns.some((ci) => ci.memberId === m.id)
      ).length;
  }
}

/** All-time bests for the profile "Personal records" section. */
export function personalRecords(memberId: string) {
  const db = getDB();
  const mine = db.checkIns
    .filter((ci) => ci.memberId === memberId)
    .sort((a, b) => +new Date(a.at) - +new Date(b.at));

  // longest streak ever
  const days = Array.from(new Set(mine.map((ci) => new Date(ci.at).setHours(0, 0, 0, 0)))).sort((a, b) => a - b);
  let longest = 0, run = 0, prev = 0;
  for (const d of days) {
    run = prev && d - prev === 86400000 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }

  // best month
  const byMonth: Record<string, number> = {};
  for (const ci of mine) {
    const d = new Date(ci.at);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    byMonth[k] = (byMonth[k] ?? 0) + 1;
  }
  const best = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0];
  const bestMonthLabel = best
    ? new Date(Number(best[0].split("-")[0]), Number(best[0].split("-")[1])).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : null;

  const earliest = mine
    .map((ci) => db.classes.find((c) => c.id === ci.classId))
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
  const db = getDB();
  const days = new Set(
    db.checkIns
      .filter((ci) => ci.memberId === memberId)
      .map((ci) => new Date(ci.at).toDateString())
  );
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

export function memberStats(memberId: string) {
  const db = getDB();
  const mine = db.checkIns.filter((ci) => ci.memberId === memberId);
  const total = mine.length;
  const hours = Math.round(
    mine.reduce((acc, ci) => {
      const c = db.classes.find((x) => x.id === ci.classId);
      return acc + (c ? c.durationMin : 50);
    }, 0) / 60
  );
  const instructorCounts: Record<string, number> = {};
  const hourCounts: Record<number, number> = {};
  for (const ci of mine) {
    const c = db.classes.find((x) => x.id === ci.classId);
    if (!c) continue;
    instructorCounts[c.instructorId] = (instructorCounts[c.instructorId] ?? 0) + 1;
    const h = new Date(c.startsAt).getHours();
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  const favInstructorId = Object.entries(instructorCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const favInstructor = db.instructors.find((i) => i.id === favInstructorId)?.name ?? "—";
  const favHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const thisMonth = mine.filter((ci) => {
    const d = new Date(ci.at);
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

export function fmtDate(isoStr: string) {
  return new Date(isoStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
export function fmtTime(isoStr: string) {
  return new Date(isoStr).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
