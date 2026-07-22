import fs from "fs";
import path from "path";
import { DB, StudioClass, Booking, CheckIn } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

function iso(d: Date) {
  return d.toISOString();
}
function daysFromNow(n: number, hour = 9, min = 0) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, min, 0, 0);
  return d;
}

function seed(): DB {
  const instructors = [
    { id: "i-karolina", name: "Karolina", role: "Founder & CEO, Coach" },
    { id: "i-lidu", name: "Lidu", role: "Trenér" },
    { id: "i-marketa", name: "Markéta", role: "Senior coach" },
    { id: "i-karolina2", name: "Karolína K.", role: "Coach" },
    { id: "i-adela", name: "Adéla", role: "Coach" },
    { id: "i-lukas", name: "Lukáš", role: "Coach" },
    { id: "i-francesca", name: "Francesca", role: "Coach" },
    { id: "i-eva", name: "Eva", role: "Senior yoga trainer" },
  ];

  const classTitles = [
    "Reformer Flow",
    "Reformer Sculpt",
    "Reformer Basics",
    "Power Reformer",
    "Morning Reformer",
    "Yoga Flow",
  ];

  // Class schedule: past 30 days + next 7 days, 4 classes/day
  const classes: StudioClass[] = [];
  const slotHours = [7, 9, 12, 17, 19];
  let cid = 0;
  for (let d = -30; d <= 7; d++) {
    for (let s = 0; s < slotHours.length; s++) {
      const start = daysFromNow(d, slotHours[s], s % 2 === 0 ? 15 : 30);
      classes.push({
        id: `c-${++cid}`,
        title: classTitles[(d + 30 + s) % classTitles.length],
        instructorId: instructors[(d + 30 + s) % instructors.length].id,
        startsAt: iso(start),
        durationMin: 50,
      });
    }
  }
  // A class starting in 10 minutes so the demo member can check in right away
  const demoClass: StudioClass = {
    id: "c-demo-now",
    title: "Reformer Sculpt",
    instructorId: "i-marketa",
    startsAt: iso(new Date(Date.now() + 10 * 60 * 1000)),
    durationMin: 50,
  };
  classes.push(demoClass);

  const members = [
    {
      id: "m-you",
      name: "Petra Nováková",
      email: "petra@example.com",
      membershipType: "Monthly Pass" as const,
      membershipExpires: iso(daysFromNow(21)),
      joinedAt: iso(daysFromNow(-260)),
      qrCode: "RXM-PETRA-8842",
      simplybookId: "sb-1001",
    },
    {
      id: "m-jana",
      name: "Jana Svobodová",
      email: "jana@example.com",
      membershipType: "Unlimited" as const,
      membershipExpires: iso(daysFromNow(40)),
      joinedAt: iso(daysFromNow(-420)),
      qrCode: "RXM-JANA-1290",
      simplybookId: "sb-1002",
    },
    {
      id: "m-tomas",
      name: "Tomáš Dvořák",
      email: "tomas@example.com",
      membershipType: "Package 10" as const,
      membershipExpires: iso(daysFromNow(65)),
      joinedAt: iso(daysFromNow(-90)),
      qrCode: "RXM-TOMAS-5511",
      simplybookId: "sb-1003",
      referredBy: "m-you",
    },
    {
      id: "m-eliska",
      name: "Eliška Marešová",
      email: "eliska@example.com",
      membershipType: "Monthly Pass" as const,
      membershipExpires: iso(daysFromNow(-4)), // expired — demo of blocked check-in
      joinedAt: iso(daysFromNow(-150)),
      qrCode: "RXM-ELISKA-7733",
      simplybookId: "sb-1004",
    },
  ];

  // Past attendance to make stats & leaderboards feel alive
  const checkIns: CheckIn[] = [];
  const bookings: Booking[] = [];
  let bid = 0;
  const attend = (memberId: string, everyNdays: number, jitter: number) => {
    for (let d = -30; d < 0; d++) {
      if ((d + jitter) % everyNdays !== 0) continue;
      const cls = classes.find((c) => {
        const cd = new Date(c.startsAt);
        const target = daysFromNow(d, 0);
        return cd.toDateString() === target.toDateString();
      });
      if (!cls) continue;
      bookings.push({ id: `b-${++bid}`, memberId, classId: cls.id, source: "wordpress" });
      checkIns.push({ id: `ci-${bid}`, memberId, classId: cls.id, at: cls.startsAt });
    }
  };
  attend("m-you", 3, 0); // ~10 visits last month
  // Extra visits for the demo member inside the 10-in-30 window (days -14..-11)
  // so today's demo check-in is the 10th — the challenge completes live in the demo.
  for (const d of [-14, -13, -12, -11, -10]) {
    const evening = classes.find((c) => {
      const cd = new Date(c.startsAt);
      return cd.toDateString() === daysFromNow(d, 0).toDateString() && cd.getHours() >= 17;
    });
    if (evening && !checkIns.some((ci) => ci.memberId === "m-you" && ci.classId === evening.id)) {
      bookings.push({ id: `b-${++bid}`, memberId: "m-you", classId: evening.id, source: "wordpress" });
      checkIns.push({ id: `ci-x${bid}`, memberId: "m-you", classId: evening.id, at: evening.startsAt });
    }
  }
  attend("m-jana", 2, 1); // ~15 visits
  attend("m-tomas", 5, 2); // ~6 visits

  // Upcoming booking for the demo member: the class starting in 10 min + one tomorrow
  bookings.push({ id: `b-${++bid}`, memberId: "m-you", classId: demoClass.id, source: "wordpress" });
  const tomorrow = classes.find((c) => new Date(c.startsAt) > daysFromNow(1, 0) && new Date(c.startsAt) < daysFromNow(1, 23));
  if (tomorrow) bookings.push({ id: `b-${++bid}`, memberId: "m-you", classId: tomorrow.id, source: "wordpress" });

  const summerStart = new Date(new Date().getFullYear(), 6, 1); // Jul 1
  const summerEnd = new Date(new Date().getFullYear(), 7, 31); // Aug 31

  const db: DB = {
    members,
    instructors,
    classes,
    bookings,
    checkIns,
    challenges: [
      {
        id: "ch-10in30",
        name: "10 Classes in 30 Days",
        emoji: "🏆",
        description: "Complete 10 classes within 30 days and earn a pair of RX grip socks.",
        type: "class_count",
        goal: 10,
        startDate: iso(daysFromNow(-15)),
        endDate: iso(daysFromNow(15)),
        reward: "Free grip socks",
        rewardEmoji: "🧦",
        springColor: "red",
        leaderboard: false,
        active: true,
      },
      {
        id: "ch-streak7",
        name: "7-Day Streak",
        emoji: "🔥",
        description: "One class every day for 7 consecutive days. The carriage never stops.",
        type: "streak_days",
        goal: 7,
        reward: "Free class credit",
        rewardEmoji: "🤸",
        springColor: "yellow",
        leaderboard: false,
        active: true,
      },
      {
        id: "ch-summer",
        name: "Summer Sculpt",
        emoji: "💜",
        description: "20 classes between July 1 and August 31. Top of the leaderboard wins a month of Unlimited.",
        type: "class_count",
        goal: 20,
        startDate: iso(summerStart),
        endDate: iso(summerEnd),
        reward: "1 month Unlimited (leaderboard winner)",
        rewardEmoji: "👑",
        springColor: "blue",
        leaderboard: true,
        active: true,
      },
      {
        id: "ch-first100",
        name: "First 100 Classes",
        emoji: "✨",
        description: "A lifetime achievement. One hundred classes at ReformerX.",
        type: "lifetime_count",
        goal: 100,
        reward: "Exclusive RX tote + member event invite",
        rewardEmoji: "👜",
        springColor: "green",
        leaderboard: false,
        active: true,
      },
      {
        id: "ch-friend",
        name: "Bring a Friend",
        emoji: "🤝",
        description: "Share your member code. When a friend joins with it and takes their first class, a guest pass is yours.",
        type: "referrals",
        goal: 1,
        reward: "Guest pass",
        rewardEmoji: "🎟️",
        springColor: "green",
        leaderboard: false,
        active: true,
      },
      {
        id: "ch-monthly",
        name: "Monthly Rhythm",
        emoji: "📆",
        description: "Eight classes this calendar month. Resets on the 1st — a fresh smoothie every month you hit it.",
        type: "monthly_count",
        goal: 8,
        reward: "Protein smoothie",
        rewardEmoji: "🥤",
        springColor: "yellow",
        leaderboard: false,
        active: true,
      },
      {
        id: "ch-instructors",
        name: "Meet Every Coach",
        emoji: "🎯",
        description: "Take at least one class with every ReformerX instructor.",
        type: "instructor_variety",
        goal: 8,
        reward: "Coffee & smoothie voucher",
        rewardEmoji: "☕",
        springColor: "blue",
        leaderboard: false,
        active: true,
      },
    ],
    challengeProgress: [
      { memberId: "m-you", challengeId: "ch-10in30", joinedAt: iso(daysFromNow(-15)), progress: 0 },
      { memberId: "m-you", challengeId: "ch-first100", joinedAt: iso(daysFromNow(-200)), progress: 0 },
      { memberId: "m-you", challengeId: "ch-monthly", joinedAt: iso(daysFromNow(-20)), progress: 0 },
      { memberId: "m-jana", challengeId: "ch-10in30", joinedAt: iso(daysFromNow(-15)), progress: 10, completedAt: iso(daysFromNow(-2)) },
      { memberId: "m-jana", challengeId: "ch-summer", joinedAt: iso(summerStart), progress: 0 },
      { memberId: "m-you", challengeId: "ch-summer", joinedAt: iso(summerStart), progress: 0 },
    ],
    badgeDefs: [
      { id: "bd-first", name: "First Carriage Ride", emoji: "🚃", description: "Your very first class at ReformerX." },
      { id: "bd-early", name: "Early Bird", emoji: "🌅", description: "Checked in to a class before 9:00." },
      { id: "bd-weekend", name: "Weekend Warrior", emoji: "🛡️", description: "5 weekend classes completed." },
      { id: "bd-10", name: "10 Classes", emoji: "🔟", description: "Ten classes done." },
      { id: "bd-50", name: "Halfway to Legend", emoji: "⭐", description: "Fifty classes done." },
      { id: "bd-100", name: "Pilates Addict", emoji: "💯", description: "One hundred classes done." },
      { id: "bd-year", name: "1 Year Member", emoji: "🎂", description: "One year since you joined." },
      { id: "bd-streak", name: "Consistency Champion", emoji: "🏅", description: "A 7-day class streak." },
    ],
    earnedBadges: [
      { memberId: "m-you", badgeId: "bd-first", earnedAt: iso(daysFromNow(-259)) },
      { memberId: "m-you", badgeId: "bd-10", earnedAt: iso(daysFromNow(-120)) },
      { memberId: "m-jana", badgeId: "bd-first", earnedAt: iso(daysFromNow(-419)) },
      { memberId: "m-jana", badgeId: "bd-year", earnedAt: iso(daysFromNow(-55)) },
    ],
    earnedRewards: [
      {
        id: "er-1",
        memberId: "m-jana",
        challengeId: "ch-10in30",
        challengeName: "10 Classes in 30 Days",
        reward: "Free grip socks",
        rewardEmoji: "🧦",
        earnedAt: iso(daysFromNow(-2)),
        status: "ready",
        decidedAt: iso(daysFromNow(-1)),
      },
    ],
    notifications: [],
    pushSubs: [],
    settings: { leaderboardsEnabled: true, studioCode: "RX-STUDIO-CHECKIN" },
  };
  return db;
}

declare global {
  // eslint-disable-next-line no-var
  var __rxdb: DB | undefined;
  // eslint-disable-next-line no-var
  var __rxdbLoadedAt: number | undefined;
}

/* ---------------- Supabase persistence (server-only, service role) ----------------
   The whole store is persisted as one JSON document in the app_state table.
   No SDK needed — plain PostgREST calls. When SUPABASE_URL/KEY are absent
   (local dev), the store falls back to .data/db.json exactly as before.      */

const SUPA_URL = (process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPA_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const hasSupabase = SUPA_URL.length > 0 && SUPA_KEY.length > 0;
const REFRESH_MS = 30_000; // re-read from Supabase when cache is older than this

function supaHeaders() {
  return {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
    "Content-Type": "application/json",
  };
}

async function supaLoad(): Promise<DB | null> {
  const res = await fetch(`${SUPA_URL}/rest/v1/app_state?key=eq.db&select=value`, {
    headers: supaHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase load failed: ${res.status}`);
  const rows = (await res.json()) as Array<{ value: DB }>;
  return rows[0]?.value ?? null;
}

async function supaSave(db: DB): Promise<void> {
  const res = await fetch(`${SUPA_URL}/rest/v1/app_state?on_conflict=key`, {
    method: "POST",
    headers: { ...supaHeaders(), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ key: "db", value: db, updated_at: new Date().toISOString() }]),
  });
  if (!res.ok) throw new Error(`Supabase save failed: ${res.status} ${await res.text().catch(() => "")}`);
}

/** Await this at the top of every page/action/route before using getDB(). */
export async function ensureDB(): Promise<DB> {
  const fresh = globalThis.__rxdb && Date.now() - (globalThis.__rxdbLoadedAt ?? 0) < REFRESH_MS;
  if (fresh) return globalThis.__rxdb!;
  if (hasSupabase) {
    try {
      const remote = await supaLoad();
      if (remote) {
        globalThis.__rxdb = remote;
        globalThis.__rxdbLoadedAt = Date.now();
        return remote;
      }
      // First run against an empty database: seed it
      const seeded = globalThis.__rxdb ?? seed();
      globalThis.__rxdb = seeded;
      globalThis.__rxdbLoadedAt = Date.now();
      await supaSave(seeded);
      return seeded;
    } catch (e) {
      console.error("[store] Supabase unavailable, using local cache:", e);
      // fall through to local behavior so the app stays up
    }
  }
  return getDB();
}

export function getDB(): DB {
  if (globalThis.__rxdb) return globalThis.__rxdb;
  try {
    if (fs.existsSync(DATA_FILE)) {
      globalThis.__rxdb = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as DB;
      globalThis.__rxdbLoadedAt = Date.now();
      return globalThis.__rxdb;
    }
  } catch {
    /* fall through to seed */
  }
  globalThis.__rxdb = seed();
  globalThis.__rxdbLoadedAt = Date.now();
  saveDB();
  return globalThis.__rxdb;
}

export function saveDB() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(globalThis.__rxdb, null, 2));
  } catch {
    /* read-only environments (Vercel): Supabase is the real store there */
  }
  if (hasSupabase && globalThis.__rxdb) {
    globalThis.__rxdbLoadedAt = Date.now(); // our copy is the newest
    void supaSave(globalThis.__rxdb).catch((e) => console.error("[store] save failed:", e));
  }
}

export function resetDB() {
  globalThis.__rxdb = seed();
  saveDB();
}
