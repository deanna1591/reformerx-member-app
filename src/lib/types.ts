export type MembershipType = "Single Entry" | "Package 10" | "Monthly Pass" | "Unlimited" | "Member";

export interface LoginCode {
  email: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  createdAt: string;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  membershipType: MembershipType;
  membershipExpires: string; // ISO date
  joinedAt: string; // ISO date
  qrCode: string; // encoded in personal QR
  simplybookId?: string;
  locale?: "en" | "cs";
  passName?: string; // exact product name, e.g. "Monthly Unlimited"
  passStart?: string; // ISO — start of the current pass period
  passCredits?: number;
  passPackageId?: string; // which SimplyBook package this pass came from
  /** The membershipExpires value we last sent a renewal reminder for. */
  renewalRemindedFor?: string; // class credits when the pass is a bundle (e.g. 10)
  referredBy?: string; // memberId of who referred them
  isAdmin?: boolean;
}

export interface Instructor {
  id: string;
  name: string;
  role: string;
  bio?: string;
  photoUrl?: string; // data URL or hosted image
  email?: string; // staff sign-in
  pinHash?: string; // hashed front-desk PIN
  staffRole?: "owner" | "instructor";
  active?: boolean; // false = hidden from booking, cannot sign in
  /**
   * True when this row is an activity or resource rather than a person —
   * "RX Cycling club", "RX Master Teacher". SimplyBook models these as
   * providers, but a member can't take a class *with* one, so they're excluded
   * from the Meet Every Coach challenge on both sides of the count.
   */
  isActivity?: boolean;
  simplybookUnitId?: string;
}

export interface StudioClass {
  id: string;
  title: string;
  instructorId: string;
  startsAt: string; // ISO datetime
  durationMin: number;
  serviceId?: string; // SimplyBook event/service id — needed to book via API
  unitId?: string; // SimplyBook performer id
  capacity?: number; // max bookings per class (SimplyBook limit_booking)
  spotsLeft?: number;
  /**
   * False when SimplyBook's timetable no longer offers this class but a member
   * still holds a booking for it. Kept so the booking isn't orphaned, hidden
   * from everyone else, and never bookable — SimplyBook would reject it.
   * Undefined means unknown (outside the synced horizon, or seed data).
   */
  onTimetable?: boolean;
}

/** A pass/package the studio sells (synced from SimplyBook purchase history). */
export interface WaitlistEntry {
  id: string;
  memberId: string;
  classId: string;
  joinedAt: string;
  /** waiting → offered (spot free, awaiting confirmation) → confirmed | declined | expired */
  status: "waiting" | "offered" | "confirmed" | "declined" | "expired";
  offeredAt?: string;
  offerExpiresAt?: string;
}

export interface Promotion {
  id: string;
  title: string;
  subtitle?: string;
  body?: string;
  imageUrl?: string;
  linkUrl?: string;
  linkLabel?: string;
  badge?: string; // e.g. "AUGUST 2026"
  startsAt?: string; // ISO — hidden before this
  endsAt?: string; // ISO — hidden after this
  active: boolean;
  order: number;
  createdAt: string;
}

export interface PackageServiceAllowance {
  serviceId: string;
  name: string;
  qty: number;
}

export interface StudioPackage {
  id: string;
  packageId?: string; // SimplyBook package id
  services?: PackageServiceAllowance[];
  name: string;
  price: number;
  currency: string;
  validityDays?: number;
  classes?: number; // credits, when the name implies a bundle
  popular?: boolean;
}

export interface Booking {
  id: string;
  memberId: string;
  classId: string;
  source: "wordpress" | "manual" | "simplybook" | "app";
  simplybookBookingId?: string;
  bookedAt?: string;
  /** Set once the pre-class reminder has gone out, so it only sends once. */
  reminderSentAt?: string;
}

export interface CheckIn {
  id: string;
  memberId: string;
  classId: string;
  at: string; // ISO datetime
}

/**
 * Challenge progress is counted from studio QR check-ins only — never from
 * bookings. Badges use attendance; challenges require the member to physically
 * scan in. Keep the two apart.
 */
export type ChallengeType =
  | "class_count" // N classes within a fixed date range
  | "rolling_count" // N classes within windowDays of joining the challenge
  | "streak_days" // N consecutive days with a class
  | "instructor_variety" // one class with each instructor (goal 0 = all of them)
  | "lifetime_count" // N classes total, ever
  | "monthly_count" // N classes in the current calendar month (resets on the 1st)
  | "referrals"; // N friends who joined with your code and took their first class

export interface Challenge {
  id: string;
  name: string;
  emoji: string;
  description: string;
  type: ChallengeType;
  goal: number;
  startDate?: string; // ISO date, class_count only
  endDate?: string;
  /** rolling_count only: length of the window, measured from when they joined. */
  windowDays?: number;
  reward: string;
  rewardEmoji?: string;
  springColor: "red" | "blue" | "yellow" | "green";
  leaderboard: boolean;
  active: boolean;
}

export interface ChallengeProgress {
  memberId: string;
  challengeId: string;
  joinedAt: string;
  progress: number;
  completedAt?: string;
  rewardClaimed?: boolean;
}

export interface BadgeDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** Owner-uploaded artwork as a data URL. Shown instead of the emoji. */
  imageUrl?: string;
  /** Custom badges only: classes attended needed to earn it automatically. */
  classesRequired?: number;
  /** True for owner-created badges; built-ins are defined in code. */
  custom?: boolean;
}

export interface EarnedBadge {
  memberId: string;
  badgeId: string;
  earnedAt: string;
  /** Set once the member has seen the celebration on the home screen. */
  celebrated?: boolean;
}

/** A reward earned by completing a challenge. Lifecycle:
 *  earned (auto-created on completion) -> ready (studio confirmed, pick up at reception)
 *  -> collected (handed over) | declined (edge cases) */
export interface EarnedReward {
  id: string;
  memberId: string;
  challengeId: string;
  challengeName: string; // snapshot so history survives challenge edits
  reward: string; // snapshot
  rewardEmoji: string;
  earnedAt: string;
  status: "earned" | "ready" | "collected" | "declined";
  decidedAt?: string;
}

export interface AppNotification {
  id: string;
  memberId: string;
  /** Pre-rendered text (legacy / studio announcements). */
  text: string;
  /** Translation key + params, when the message is app-generated. */
  key?: string;
  params?: Record<string, string | number>;
  at: string;
  read: boolean;
}

export interface DB {
  members: Member[];
  instructors: Instructor[];
  classes: StudioClass[];
  bookings: Booking[];
  checkIns: CheckIn[];
  challenges: Challenge[];
  challengeProgress: ChallengeProgress[];
  badgeDefs: BadgeDef[];
  earnedBadges: EarnedBadge[];
  earnedRewards: EarnedReward[];
  notifications: AppNotification[];
  pushSubs: { memberId: string; sub: unknown }[];
  packages?: StudioPackage[];
  promotions?: Promotion[];
  waitlist?: WaitlistEntry[];
  loginCodes?: LoginCode[];
  settings: {
    leaderboardsEnabled: boolean;
    studioCode: string;
    lastSync?: string;
    /** Marks the one-time challenge rule repair as done. */
    challengeFixV1?: boolean;
  };
}
