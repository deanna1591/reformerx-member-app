export type MembershipType = "Single Entry" | "Package 10" | "Monthly Pass" | "Unlimited";

export interface Member {
  id: string;
  name: string;
  email: string;
  membershipType: MembershipType;
  membershipExpires: string; // ISO date
  joinedAt: string; // ISO date
  qrCode: string; // encoded in personal QR
  simplybookId?: string;
  isAdmin?: boolean;
}

export interface Instructor {
  id: string;
  name: string;
  role: string;
}

export interface StudioClass {
  id: string;
  title: string;
  instructorId: string;
  startsAt: string; // ISO datetime
  durationMin: number;
}

export interface Booking {
  id: string;
  memberId: string;
  classId: string;
  source: "wordpress" | "manual" | "simplybook";
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
  | "lifetime_count"; // N classes total, ever

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

export interface RewardItem {
  id: string;
  name: string;
  emoji: string;
  cost: number; // points
  available: boolean;
}

export interface Redemption {
  id: string;
  memberId: string;
  rewardId: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  note?: string; // e.g. challenge completion grant
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
  rewards: RewardItem[];
  redemptions: Redemption[];
  notifications: AppNotification[];
  points: Record<string, number>; // memberId -> points
  settings: { leaderboardsEnabled: boolean; studioCode: string; lastSync?: string };
}
