/**
 * The studio's standing challenge set.
 *
 * Every one is seeded as a DRAFT (`active: false`) with an empty reward, so the
 * owner fills in what each is worth on /admin/challenges and flips it live.
 * Nothing here reaches members until that happens.
 *
 * Progress is counted from QR check-ins only — see computeProgress.
 */

import type { Challenge } from "./types";

/** First day of the current month, ISO, for the monthly campaign window. */
function monthWindow(): { startDate: string; endDate: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

export const STUDIO_CHALLENGES: Challenge[] = [
  {
    id: "ch-first-30",
    name: "First 30 Classes",
    emoji: "🌱",
    description: "Your first thirty classes at ReformerX.",
    type: "lifetime_count",
    goal: 30,
    reward: "",
    springColor: "green",
    leaderboard: false,
    active: false,
  },
  {
    id: "ch-10in30",
    name: "10 Classes in 30 Days",
    emoji: "🏆",
    description: "Ten classes within thirty days of joining the challenge.",
    type: "rolling_count",
    goal: 10,
    windowDays: 30,
    reward: "",
    springColor: "red",
    leaderboard: false,
    active: false,
  },
  {
    id: "ch-7in7",
    name: "7-Day Strike",
    emoji: "⚡",
    description: "Seven classes in seven days.",
    type: "rolling_count",
    goal: 7,
    windowDays: 7,
    reward: "",
    springColor: "yellow",
    leaderboard: false,
    active: false,
  },
  {
    id: "ch-first-100",
    name: "First 100 Classes",
    emoji: "💯",
    description: "One hundred classes at ReformerX.",
    type: "lifetime_count",
    goal: 100,
    reward: "",
    springColor: "blue",
    leaderboard: true,
    active: false,
  },
  {
    id: "ch-seasonal",
    name: "Summer Sculpt",
    emoji: "☀️",
    description: "Twenty classes during the campaign window.",
    type: "class_count",
    goal: 20,
    ...monthWindow(), // owner edits the dates each month
    reward: "",
    springColor: "yellow",
    leaderboard: true,
    active: false,
  },
  {
    id: "ch-friend",
    name: "Bring a Friend",
    emoji: "👯",
    description: "A friend joins with your code and takes their first class.",
    type: "referrals",
    goal: 1,
    reward: "",
    springColor: "green",
    leaderboard: false,
    active: false,
  },
  {
    id: "ch-monthly-rhythm",
    name: "Monthly Rhythm",
    emoji: "🗓️",
    description: "Eight classes in a calendar month. Resets on the 1st.",
    type: "monthly_count",
    goal: 8,
    reward: "",
    springColor: "blue",
    leaderboard: false,
    active: false,
  },
  {
    id: "ch-every-coach",
    name: "Meet Every Coach",
    emoji: "🤝",
    description: "Take at least one class with every reformer instructor.",
    type: "instructor_variety",
    goal: 0, // 0 = however many instructors the studio currently has
    reward: "",
    springColor: "red",
    leaderboard: false,
    active: false,
  },
];

export const STUDIO_CHALLENGE_IDS = new Set(STUDIO_CHALLENGES.map((c) => c.id));
