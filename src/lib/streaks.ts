/**
 * Streak + heatmap maths for the ReformerX member app.
 *
 * Deliberately pure: every function takes plain ISO timestamps, so it has no
 * import on the store and can be unit-tested without a database.
 *
 * Two things this fixes over the old day-based `currentStreak`:
 *   1. It counts WEEKS, not consecutive calendar days. Studio members train
 *      2-4x a week, so a day chain almost never gets past 1.
 *   2. Days are bucketed in studio time via `studioDayKey`, like the rest of
 *      the app. On Vercel the server runs in UTC, so an evening class could
 *      otherwise land on the wrong day.
 */

import { studioDayKey } from "./time";

/** Parse a day key at UTC noon — far enough from midnight that DST can't shift it. */
function keyToDate(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

function dateToKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Shift a day key by n days. */
export function addDays(key: string, n: number): string {
  const d = keyToDate(key);
  d.setUTCDate(d.getUTCDate() + n);
  return dateToKey(d);
}

/** The Monday of the week containing this day. Weeks are Monday-first, as in CZ. */
export function weekStart(key: string): string {
  const d = keyToDate(key);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return dateToKey(d);
}

export type StreakResult = {
  /** Consecutive qualifying weeks up to now. */
  current: number;
  /** Best run this member has ever had. */
  longest: number;
  /** Classes taken in the week that's currently running. */
  thisWeek: number;
  /** Classes needed per week for the week to count. */
  weeklyGoal: number;
  /** True when the streak is only alive because the current week is unfinished. */
  atRisk: boolean;
};

/**
 * Week streak. A week counts once the member hits `weeklyGoal` classes in it.
 *
 * The week in progress never breaks a streak — if it hasn't qualified yet we
 * measure from last week instead. Someone who trained every week for two months
 * shouldn't see their streak reset to 0 every Monday morning.
 */
export function weekStreak(
  checkInDates: string[],
  { weeklyGoal = 1, now = new Date() }: { weeklyGoal?: number; now?: Date } = {}
): StreakResult {
  const perWeek = new Map<string, number>();
  for (const at of checkInDates) {
    const wk = weekStart(studioDayKey(at));
    perWeek.set(wk, (perWeek.get(wk) ?? 0) + 1);
  }
  const qualifies = (wk: string) => (perWeek.get(wk) ?? 0) >= weeklyGoal;

  const currentWeek = weekStart(studioDayKey(now));
  const thisWeek = perWeek.get(currentWeek) ?? 0;
  const liveWeekDone = qualifies(currentWeek);

  let cursor = liveWeekDone ? currentWeek : addDays(currentWeek, -7);
  let current = 0;
  while (qualifies(cursor)) {
    current++;
    cursor = addDays(cursor, -7);
  }

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  // Array.from rather than [...perWeek.keys()] — spreading a Map iterator needs
  // downlevelIteration or an ES2015+ target, and this project targets lower.
  for (const wk of Array.from(perWeek.keys()).filter(qualifies).sort()) {
    run = prev !== null && addDays(prev, 7) === wk ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = wk;
  }

  return {
    current,
    longest,
    thisWeek,
    weeklyGoal,
    atRisk: current > 0 && !liveWeekDone,
  };
}

export type HeatmapDay = {
  key: string;
  count: number;
  /** Dates after today — rendered blank so the grid keeps its shape. */
  future: boolean;
};

export type HeatmapWeek = { start: string; days: HeatmapDay[] };

export type HeatmapData = {
  weeks: HeatmapWeek[];
  /** Busiest single day in the window, used to scale the colour ramp. */
  max: number;
  total: number;
};

/**
 * A Monday-first grid of the last `weeks` weeks, ending with the week in
 * progress. Seven days per week always, so the rows line up.
 */
export function buildHeatmap(
  checkInDates: string[],
  { weeks = 18, now = new Date() }: { weeks?: number; now?: Date } = {}
): HeatmapData {
  const perDay = new Map<string, number>();
  for (const at of checkInDates) {
    const k = studioDayKey(at);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }

  const today = studioDayKey(now);
  const firstWeek = addDays(weekStart(today), -7 * (weeks - 1));

  const out: HeatmapWeek[] = [];
  let max = 0;
  let total = 0;

  for (let w = 0; w < weeks; w++) {
    const start = addDays(firstWeek, w * 7);
    const days: HeatmapDay[] = [];
    for (let d = 0; d < 7; d++) {
      const key = addDays(start, d);
      const count = perDay.get(key) ?? 0;
      if (count > max) max = count;
      total += count;
      days.push({ key, count, future: key > today });
    }
    out.push({ start, days });
  }

  return { weeks: out, max: Math.max(1, max), total };
}
