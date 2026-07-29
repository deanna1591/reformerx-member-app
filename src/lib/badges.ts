/**
 * Badge rules, in one place.
 *
 * The old logic counted `db.checkIns` — QR scans only, a couple of dozen rows
 * across the whole database — so "100 classes done" really meant "100 scans"
 * and most members could never earn anything. Everything here counts
 * `attendedClasses`, the same booking-derived source the streaks and heatmap
 * use, and every rule is evaluated from scratch on each run rather than only at
 * the moment someone scans in.
 */

import type { BadgeDef, Member } from "./types";
import { STUDIO_TZ, studioDayKey } from "./time";
import { weekStart } from "./streaks";

const hourFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: STUDIO_TZ,
  hour: "2-digit",
  hour12: false,
});

/** Hour of day in studio time. Server runs in UTC, so this can't use getHours(). */
export function studioHour(at: string | Date): number {
  return parseInt(hourFmt.format(new Date(at)), 10);
}

export type BadgeInput = {
  /** ISO start times of every class the member has actually attended. */
  attendedAt: string[];
  member: Member;
  /** Members who joined via this member's code and have taken a class. */
  referrals: number;
  /** Consecutive-week streak, from memberWeekStreak. */
  weekStreak: number;
};

/** How many classes the member took in their busiest single week. */
export function bestWeekCount(attendedAt: string[]): number {
  const perWeek = new Map<string, number>();
  for (const at of attendedAt) {
    const wk = weekStart(studioDayKey(at));
    perWeek.set(wk, (perWeek.get(wk) ?? 0) + 1);
  }
  let best = 0;
  perWeek.forEach((n) => {
    if (n > best) best = n;
  });
  return best;
}

const daysSince = (iso?: string) =>
  iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : 0;

/**
 * Every built-in badge, with the rule that earns it. Ids are stable — renaming
 * a badge is safe, changing an id would orphan everyone who already has it.
 */
export const BUILTIN_BADGES: Array<
  BadgeDef & { earned: (i: BadgeInput) => boolean }
> = [
  { id: "bd-first", name: "First Class", emoji: "✨", description: "Your very first class at ReformerX.",
    earned: (i) => i.attendedAt.length >= 1 },

  { id: "bd-membership", name: "First Membership", emoji: "🎟️", description: "Your first pass at the studio.",
    earned: (i) => Boolean(i.member.passName) || Boolean(i.member.membershipExpires) },

  { id: "bd-6mo", name: "6 Months Member", emoji: "🌗", description: "Six months since you joined.",
    earned: (i) => daysSince(i.member.joinedAt) >= 182 },

  { id: "bd-year", name: "1 Year Member", emoji: "🎂", description: "One year since you joined.",
    earned: (i) => daysSince(i.member.joinedAt) >= 365 },

  { id: "bd-10", name: "10 Classes", emoji: "🔟", description: "Ten classes done.",
    earned: (i) => i.attendedAt.length >= 10 },

  { id: "bd-50", name: "Halfway to Legend", emoji: "⭐", description: "Fifty classes done.",
    earned: (i) => i.attendedAt.length >= 50 },

  { id: "bd-100", name: "Pilates Addict", emoji: "💯", description: "One hundred classes done.",
    earned: (i) => i.attendedAt.length >= 100 },

  { id: "bd-150", name: "Bronze Pilates Addict", emoji: "🥉", description: "150 classes done.",
    earned: (i) => i.attendedAt.length >= 150 },

  { id: "bd-200", name: "Silver Pilates Addict", emoji: "🥈", description: "200 classes done.",
    earned: (i) => i.attendedAt.length >= 200 },

  { id: "bd-250", name: "Gold Pilates Addict", emoji: "🥇", description: "250 classes done.",
    earned: (i) => i.attendedAt.length >= 250 },

  { id: "bd-300", name: "Diamond", emoji: "💎", description: "300 classes done.",
    earned: (i) => i.attendedAt.length >= 300 },

  { id: "bd-weekend", name: "Weekend Warrior", emoji: "🛡️", description: "Five classes in a single week.",
    earned: (i) => bestWeekCount(i.attendedAt) >= 5 },

  { id: "bd-weekend-gold", name: "Gold Weekend Warrior", emoji: "🏆", description: "Seven classes in a single week.",
    earned: (i) => bestWeekCount(i.attendedAt) >= 7 },

  { id: "bd-streak", name: "Consistency Champion", emoji: "🏅", description: "Four weeks of classes in a row.",
    earned: (i) => i.weekStreak >= 4 },

  { id: "bd-early", name: "Early Bird", emoji: "🌅", description: "Five classes starting before 10:00.",
    earned: (i) => i.attendedAt.filter((at) => studioHour(at) < 10).length >= 5 },

  { id: "bd-night", name: "Night Owl", emoji: "🦉", description: "Five classes starting at 18:00 or later.",
    earned: (i) => i.attendedAt.filter((at) => studioHour(at) >= 18).length >= 5 },

  { id: "bd-friend", name: "Bring a Friend", emoji: "👯", description: "A friend joined with your code and took a class.",
    earned: (i) => i.referrals >= 1 },

  { id: "bd-ambassador", name: "Ambassador", emoji: "📣", description: "Five friends joined and took a class.",
    earned: (i) => i.referrals >= 5 },
];

export const BUILTIN_BADGE_IDS = new Set(BUILTIN_BADGES.map((b) => b.id));

/** Seed rows for the database — the rule functions stay in code, not storage. */
export const BUILTIN_BADGE_DEFS: BadgeDef[] = BUILTIN_BADGES.map(
  ({ id, name, emoji, description }) => ({ id, name, emoji, description })
);

/**
 * Which badges this member qualifies for right now, built-in and custom.
 * Custom badges are owner-created and always trigger on a class count.
 */
export function qualifyingBadges(input: BadgeInput, allDefs: BadgeDef[]): string[] {
  const out: string[] = [];

  for (const b of BUILTIN_BADGES) {
    // only offer badges the studio still has defined
    if (!allDefs.some((d) => d.id === b.id)) continue;
    try {
      if (b.earned(input)) out.push(b.id);
    } catch {
      /* a broken rule must never break a check-in */
    }
  }

  for (const d of allDefs) {
    if (BUILTIN_BADGE_IDS.has(d.id)) continue;
    if (typeof d.classesRequired === "number" && input.attendedAt.length >= d.classesRequired) {
      out.push(d.id);
    }
  }

  return out;
}

/** Progress toward a badge, for the milestones screen. Null when not countable. */
export function badgeProgress(
  def: BadgeDef,
  input: BadgeInput
): { current: number; target: number } | null {
  const n = input.attendedAt.length;
  const byCount: Record<string, number> = {
    "bd-first": 1, "bd-10": 10, "bd-50": 50, "bd-100": 100,
    "bd-150": 150, "bd-200": 200, "bd-250": 250, "bd-300": 300,
  };
  if (byCount[def.id]) return { current: Math.min(n, byCount[def.id]), target: byCount[def.id] };
  if (def.id === "bd-weekend") return { current: Math.min(bestWeekCount(input.attendedAt), 5), target: 5 };
  if (def.id === "bd-weekend-gold") return { current: Math.min(bestWeekCount(input.attendedAt), 7), target: 7 };
  if (def.id === "bd-streak") return { current: Math.min(input.weekStreak, 4), target: 4 };
  if (def.id === "bd-early") {
    const c = input.attendedAt.filter((at) => studioHour(at) < 10).length;
    return { current: Math.min(c, 5), target: 5 };
  }
  if (def.id === "bd-night") {
    const c = input.attendedAt.filter((at) => studioHour(at) >= 18).length;
    return { current: Math.min(c, 5), target: 5 };
  }
  if (def.id === "bd-friend") return { current: Math.min(input.referrals, 1), target: 1 };
  if (def.id === "bd-ambassador") return { current: Math.min(input.referrals, 5), target: 5 };
  if (!BUILTIN_BADGE_IDS.has(def.id) && typeof def.classesRequired === "number") {
    return { current: Math.min(n, def.classesRequired), target: def.classesRequired };
  }
  return null;
}
