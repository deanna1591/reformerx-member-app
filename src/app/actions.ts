"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDB, saveDB, ensureDB, resetDB } from "@/lib/store";
import { performCheckIn, notify, CheckInResult } from "@/lib/engine";
import { Member, Challenge } from "@/lib/types";

/* ---------- auth ---------- */

export async function memberLogin(formData: FormData) {
  await ensureDB();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const db = getDB();
  const member = db.members.find((m) => m.email.toLowerCase() === email);
  if (!member) redirect("/login?error=1");

  // Referral capture: only on a member's first-ever sign-in, before any classes
  const refCode = String(formData.get("referral") ?? "").trim().toUpperCase();
  if (refCode && !member!.referredBy && !db.checkIns.some((ci) => ci.memberId === member!.id)) {
    const referrer = db.members.find((m) => m.qrCode.toUpperCase() === refCode && m.id !== member!.id);
    if (referrer) {
      member!.referredBy = referrer.id;
      notify(referrer.id, `🤝 ${member!.name.split(" ")[0]} joined with your code! Their first check-in counts toward Bring a Friend.`);
      saveDB();
    }
  }

  cookies().set("rx_member", member!.id, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 90 });
  redirect("/");
}

export async function savePushSubscription(sub: unknown) {
  await ensureDB();
  const memberId = cookies().get("rx_member")?.value;
  if (!memberId) return;
  const db = getDB();
  const endpoint = (sub as { endpoint?: string }).endpoint;
  db.pushSubs = db.pushSubs.filter(
    (s) => !(s.memberId === memberId && (s.sub as { endpoint?: string }).endpoint === endpoint)
  );
  db.pushSubs.push({ memberId, sub });
  saveDB();
}

export async function memberLogout() {
  await ensureDB();
  cookies().delete("rx_member");
  redirect("/login");
}

export async function adminLogin(formData: FormData) {
  await ensureDB();
  const password = String(formData.get("password") ?? "");
  const expected = process.env.ADMIN_PASSWORD ?? "reformerx";
  if (password !== expected) redirect("/admin/login?error=1");
  cookies().set("rx_admin", "1", { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 12 });
  redirect("/admin");
}

export async function adminLogout() {
  await ensureDB();
  cookies().delete("rx_admin");
  redirect("/admin/login");
}

/* ---------- member actions ---------- */

export async function checkInAction(code: string): Promise<CheckInResult> {
  await ensureDB();
  const memberId = cookies().get("rx_member")?.value;
  if (!memberId)
    return { ok: false, message: "Please sign in first.", completedChallenges: [], earnedRewards: [], newBadges: [] };
  const result = performCheckIn(memberId, code);
  if (result.ok && result.completedChallenges.length > 0) {
    const { sendPush } = await import("@/lib/push");
    void sendPush(memberId, `🎉 ${result.completedChallenges[0]} complete — reward unlocked: ${result.earnedRewards[0] ?? ""}`, "/rewards");
  }
  revalidatePath("/");
  revalidatePath("/challenges");
  revalidatePath("/profile");
  return result;
}

export async function joinChallenge(challengeId: string) {
  await ensureDB();
  const memberId = cookies().get("rx_member")?.value;
  if (!memberId) return;
  const db = getDB();
  const exists = db.challengeProgress.some(
    (p) => p.memberId === memberId && p.challengeId === challengeId
  );
  if (!exists) {
    db.challengeProgress.push({
      memberId,
      challengeId,
      joinedAt: new Date().toISOString(),
      progress: 0,
    });
    const ch = db.challenges.find((c) => c.id === challengeId);
    if (ch) notify(memberId, `You joined ${ch.emoji} ${ch.name}. Good luck!`);
    saveDB();
  }
  revalidatePath("/challenges");
}

export async function markNotificationsRead() {
  await ensureDB();
  const memberId = cookies().get("rx_member")?.value;
  if (!memberId) return;
  const db = getDB();
  db.notifications.forEach((n) => {
    if (n.memberId === memberId) n.read = true;
  });
  saveDB();
  revalidatePath("/");
}

/* ---------- admin actions ---------- */

function requireAdmin() {
  if (cookies().get("rx_admin")?.value !== "1") redirect("/admin/login");
}

export async function createChallenge(formData: FormData) {
  await ensureDB();
  requireAdmin();
  const db = getDB();
  const ch: Challenge = {
    id: `ch-${Date.now()}`,
    name: String(formData.get("name") ?? "New challenge"),
    emoji: String(formData.get("emoji") || "🏆"),
    description: String(formData.get("description") ?? ""),
    type: (formData.get("type") as Challenge["type"]) ?? "class_count",
    goal: Number(formData.get("goal") ?? 10),
    startDate: formData.get("startDate") ? new Date(String(formData.get("startDate"))).toISOString() : undefined,
    endDate: formData.get("endDate") ? new Date(String(formData.get("endDate"))).toISOString() : undefined,
    reward: String(formData.get("reward") ?? ""),
    springColor: (formData.get("springColor") as Challenge["springColor"]) ?? "red",
    leaderboard: formData.get("leaderboard") === "on",
    active: true,
  };
  db.challenges.unshift(ch);
  // announce to all members
  db.members.forEach((m) => notify(m.id, `New challenge at the studio: ${ch.emoji} ${ch.name} — reward: ${ch.reward}`));
  saveDB();
  revalidatePath("/admin/challenges");
  revalidatePath("/challenges");
}

export async function toggleChallenge(challengeId: string) {
  await ensureDB();
  requireAdmin();
  const db = getDB();
  const ch = db.challenges.find((c) => c.id === challengeId);
  if (ch) ch.active = !ch.active;
  saveDB();
  revalidatePath("/admin/challenges");
}

export async function setRewardStatus(rewardId: string, status: "ready" | "collected" | "declined") {
  await ensureDB();
  requireAdmin();
  const db = getDB();
  const er = db.earnedRewards.find((r) => r.id === rewardId);
  if (!er) return;
  er.status = status;
  er.decidedAt = new Date().toISOString();
  const label = `${er.rewardEmoji} ${er.reward}`;
  if (status === "ready") {
    notify(er.memberId, `🎁 Your reward is ready: ${label}. Pick it up at reception on your next visit.`);
    const { sendPush } = await import("@/lib/push");
    void sendPush(er.memberId, `🎁 ${er.reward} is ready at reception!`, "/rewards");
  }
  if (status === "collected") notify(er.memberId, `Enjoy your ${er.reward}! Thanks for crushing ${er.challengeName}.`);
  if (status === "declined")
    notify(er.memberId, `About your ${er.challengeName} reward — please ask at reception for details.`);
  saveDB();
  revalidatePath("/admin/redemptions");
  revalidatePath("/rewards");
}

export async function updateMembership(memberId: string, formData: FormData) {
  await ensureDB();
  requireAdmin();
  const db = getDB();
  const m = db.members.find((x) => x.id === memberId);
  if (!m) return;
  const type = String(formData.get("type") ?? m.membershipType);
  const expires = String(formData.get("expires") ?? "");
  m.membershipType = type as typeof m.membershipType;
  if (expires) m.membershipExpires = new Date(`${expires}T23:59:59`).toISOString();
  saveDB();
  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath("/admin/members");
}

export async function extendMembership(memberId: string, days: number) {
  await ensureDB();
  requireAdmin();
  const db = getDB();
  const m = db.members.find((x) => x.id === memberId);
  if (!m) return;
  const base = Math.max(Date.now(), new Date(m.membershipExpires).getTime());
  m.membershipExpires = new Date(base + days * 86400000).toISOString();
  notify(memberId, `Your membership was extended to ${new Date(m.membershipExpires).toLocaleDateString("en-GB")}. See you on the reformer!`);
  saveDB();
  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath("/admin/members");
}

export async function sendMemberMessage(memberId: string, formData: FormData) {
  await ensureDB();
  requireAdmin();
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  notify(memberId, `💬 ${text}`);
  saveDB();
  const { sendPush } = await import("@/lib/push");
  void sendPush(memberId, text);
  revalidatePath(`/admin/members/${memberId}`);
}

export async function adminCheckIn(memberId: string, formData: FormData) {
  await ensureDB();
  requireAdmin();
  const classId = String(formData.get("classId") ?? "");
  if (!classId) return;
  const db = getDB();
  if (db.checkIns.some((ci) => ci.memberId === memberId && ci.classId === classId)) return;
  const { recordAttendance } = await import("@/lib/engine");
  const res = recordAttendance(memberId, classId);
  const cls = db.classes.find((c) => c.id === classId);
  notify(memberId, `Front desk checked you in to ${cls?.title ?? "class"}. Enjoy!`);
  if (res.completedChallenges.length) {
    const { sendPush } = await import("@/lib/push");
    void sendPush(memberId, `🎉 ${res.completedChallenges[0]} complete!`, "/rewards");
  }
  saveDB();
  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath("/admin/members");
}

export async function sendAnnouncement(formData: FormData) {
  await ensureDB();
  requireAdmin();
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  const db = getDB();
  db.members.forEach((m) => notify(m.id, `📣 ${text}`));
  saveDB();
  const { sendPushToAll } = await import("@/lib/push");
  void sendPushToAll(`📣 ${text}`);
  revalidatePath("/admin");
}

export async function toggleLeaderboards() {
  await ensureDB();
  requireAdmin();
  const db = getDB();
  db.settings.leaderboardsEnabled = !db.settings.leaderboardsEnabled;
  saveDB();
  revalidatePath("/admin/settings");
}

export async function simulateSimplybookSync() {
  await ensureDB();
  requireAdmin();
  const { simplybookConfigured, syncFromSimplybook } = await import("@/lib/simplybook");
  const db = getDB();

  if (simplybookConfigured()) {
    // Real sync against the SimplyBook REST v2 admin API.
    try {
      const result = await syncFromSimplybook();
      console.log("[sync]", result.message);
      getDB().settings.lastSync = `${new Date().toISOString()}|${result.ok ? "ok" : "err"}|${result.message}`;
      saveDB();
    } catch (e) {
      console.error("[sync] threw:", e);
      db.settings.lastSync = `${new Date().toISOString()}|err|${e instanceof Error ? e.message : "Sync failed"}`;
      saveDB();
    }
  } else {
    // Demo mode: refresh expirations so the demo stays usable.
    db.members.forEach((m) => {
      if (m.id !== "m-eliska") {
        const d = new Date(m.membershipExpires);
        if (d.getTime() < Date.now()) {
          d.setDate(d.getDate() + 30);
          m.membershipExpires = d.toISOString();
        }
      }
    });
    db.settings.lastSync = `${new Date().toISOString()}|demo|Demo mode — set SIMPLYBOOK_COMPANY, SIMPLYBOOK_LOGIN and SIMPLYBOOK_USER_KEY in .env.local to sync real data.`;
    saveDB();
  }
  revalidatePath("/admin/members");
}

export async function resetDemoData() {
  await ensureDB();
  requireAdmin();
  resetDB();
  revalidatePath("/", "layout");
}

/* ---------- admin member management ---------- */
