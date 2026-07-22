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
  passName?: string; // exact product name, e.g. "Monthly Unlimited"
  passStart?: string; // ISO — start of the current pass period
  passCredits?: number; // class credits when the pass is a bundle (e.g. 10)
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
  spotsLeft?: number;
}

/** A pass/package the studio sells (synced from SimplyBook purchase history). */
export interface StudioPackage {
  id: string;
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
}

export interface CheckIn {
  id: string;
  memberId: string;
  classId: string;
  at: string; // ISO datetime
}

export type ChallengeType =
  | "class_count" // N classes within date range
  | "streak_days" // N consecutive days with a class
  | "instructor_variety" // one class with each of N instructors
  | "lifetime_count" // N classes total, ever
  | "monthly_count" // N classes in the current calendar month (resets monthly)
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
}

export interface EarnedBadge {
  memberId: string;
  badgeId: string;
  earnedAt: string;
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
  text: string;
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
  loginCodes?: LoginCode[];
  settings: { leaderboardsEnabled: boolean; studioCode: string; lastSync?: string };
}
