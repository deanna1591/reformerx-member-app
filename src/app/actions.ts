"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDB, saveDB, ensureDB, resetDB } from "@/lib/store";
import { performCheckIn, notify, CheckInResult } from "@/lib/engine";
import { currentMember } from "@/lib/auth";
import { Member, Challenge } from "@/lib/types";

/* ---------- auth ---------- */

/** Step 1 — email a one-time code to a SimplyBook client. */
export async function requestLoginCode(formData: FormData) {
  await ensureDB();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const referral = String(formData.get("referral") ?? "").trim();
  if (!email) redirect("/login?error=email");

  const db = getDB();
  const member = db.members.find((m) => m.email.toLowerCase() === email);

  // Only send to real members, but never reveal which addresses exist.
  if (member) {
    const { issueCode } = await import("@/lib/otp");
    const code = issueCode(email);
    if (code === null) redirect(`/login?step=code&email=${encodeURIComponent(email)}&error=rate`);
    const { sendEmail, loginCodeEmail } = await import("@/lib/email");
    const msg = loginCodeEmail(code, member.name.split(" ")[0]);
    await sendEmail(member.email, msg.subject, msg.html, msg.text);
  }

  const qs = new URLSearchParams({ step: "code", email });
  if (referral) qs.set("referral", referral);
  redirect(`/login?${qs.toString()}`);
}

/** Step 2 — verify the code and start the session. */
export async function verifyLoginCode(formData: FormData) {
  await ensureDB();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").trim();
  const referral = String(formData.get("referral") ?? "").trim().toUpperCase();
  const back = (reason: string) =>
    redirect(`/login?step=code&email=${encodeURIComponent(email)}&error=${reason}`);

  const { verifyCode } = await import("@/lib/otp");
  const result = verifyCode(email, code);
  if (!result.ok) back(result.reason === "That code expired." ? "expired" : "code");

  const db = getDB();
  const member = db.members.find((m) => m.email.toLowerCase() === email);
  if (!member) back("code");

  // Referral capture: first sign-in only, before any classes
  if (referral && !member!.referredBy && !db.checkIns.some((ci) => ci.memberId === member!.id)) {
    const referrer = db.members.find((m) => m.qrCode.toUpperCase() === referral && m.id !== member!.id);
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

/* ---------- member booking ---------- */

export async function reserveClass(formData: FormData) {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");
  const classId = String(formData.get("classId") ?? "");
  const db = getDB();
  const cls = db.classes.find((c) => c.id === classId);
  if (!cls) return;

  // Already booked? Nothing to do.
  if (db.bookings.some((b) => b.memberId === member.id && b.classId === classId)) {
    revalidatePath("/schedule");
    return;
  }

  const { createSimplybookBooking, inAppBookingEnabled } = await import("@/lib/simplybook");
  if (!inAppBookingEnabled() || !cls.serviceId || !member.simplybookId) {
    notify(member.id, "Reservations are handled on the ReformerX booking page for now.");
    saveDB();
    return;
  }

  const res = await createSimplybookBooking({
    clientId: member.simplybookId,
    serviceId: cls.serviceId,
    unitId: cls.unitId,
    startsAt: cls.startsAt,
  });

  if (res.ok) {
    db.bookings.push({
      id: `b-app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      memberId: member.id,
      classId,
      source: "app",
      simplybookBookingId: res.id,
      bookedAt: new Date().toISOString(),
    });
    notify(member.id, `Booked: ${cls.title} on ${new Date(cls.startsAt).toLocaleString()}`);
  } else {
    notify(member.id, `Could not reserve ${cls.title}: ${res.message}`);
  }
  saveDB();
  revalidatePath("/schedule");
  revalidatePath("/");
}

export async function cancelReservation(formData: FormData) {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");
  const classId = String(formData.get("classId") ?? "");
  const db = getDB();
  const booking = db.bookings.find((b) => b.memberId === member.id && b.classId === classId);
  if (!booking) return;

  if (booking.simplybookBookingId) {
    const { cancelSimplybookBooking } = await import("@/lib/simplybook");
    const res = await cancelSimplybookBooking(booking.simplybookBookingId);
    if (!res.ok) {
      notify(member.id, `Could not cancel: ${res.message}`);
      saveDB();
      return;
    }
  }
  db.bookings = db.bookings.filter((b) => b !== booking);
  const cls = db.classes.find((c) => c.id === classId);
  notify(member.id, `Cancelled: ${cls?.title ?? "class"}`);
  saveDB();
  revalidatePath("/schedule");
  revalidatePath("/");
}

export async function rescheduleClass(formData: FormData) {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");
  const fromId = String(formData.get("fromClassId") ?? "");
  const toId = String(formData.get("toClassId") ?? "");
  const db = getDB();
  const booking = db.bookings.find((b) => b.memberId === member.id && b.classId === fromId);
  const target = db.classes.find((c) => c.id === toId);
  if (!booking || !target) return;
  if (db.bookings.some((b) => b.memberId === member.id && b.classId === toId)) return;

  const { createSimplybookBooking, cancelSimplybookBooking, inAppBookingEnabled } = await import("@/lib/simplybook");

  if (inAppBookingEnabled() && member.simplybookId && target.serviceId) {
    // Take the new spot first — if it's full, the member keeps the original class.
    const created = await createSimplybookBooking({
      clientId: member.simplybookId,
      serviceId: target.serviceId,
      unitId: target.unitId,
      startsAt: target.startsAt,
      durationMin: target.durationMin,
    });
    if (!created.ok) {
      notify(member.id, `Could not move: ${created.message}`);
      saveDB();
      return;
    }
    if (booking.simplybookBookingId) await cancelSimplybookBooking(booking.simplybookBookingId);
    booking.simplybookBookingId = created.id;
  }

  booking.classId = toId;
  booking.bookedAt = new Date().toISOString();
  notify(member.id, `Moved to ${target.title} on ${new Date(target.startsAt).toLocaleString()}`);
  saveDB();
  revalidatePath("/schedule");
  revalidatePath(`/class/${toId}`);
  revalidatePath("/");
  redirect(`/class/${toId}`);
}

/* ---------- instructors & staff ---------- */

function requireOwner() {
  const { isOwner } = require("@/lib/staff") as typeof import("@/lib/staff");
  if (!isOwner()) redirect("/admin/login");
}

export async function saveInstructor(formData: FormData) {
  await ensureDB();
  requireOwner();
  const db = getDB();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const role = String(formData.get("role") ?? "Instructor").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const pin = String(formData.get("pin") ?? "").trim();
  const staffRole = String(formData.get("staffRole") ?? "instructor") === "owner" ? "owner" : "instructor";
  const active = formData.get("active") !== null;
  const photoUrlField = String(formData.get("photoUrl") ?? "").trim();

  // Photo upload → data URL (kept small; the studio has a handful of coaches)
  let photoUrl = photoUrlField || undefined;
  const file = formData.get("photo");
  if (file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0) {
    const f = file as File;
    if (f.size <= 900_000 && f.type.startsWith("image/")) {
      const buf = Buffer.from(await f.arrayBuffer());
      photoUrl = `data:${f.type};base64,${buf.toString("base64")}`;
    }
  }

  const { hashPin } = await import("@/lib/staff");
  const existing = id ? db.instructors.find((i) => i.id === id) : undefined;

  if (existing) {
    existing.name = name;
    existing.role = role;
    existing.bio = bio || undefined;
    if (photoUrl) existing.photoUrl = photoUrl;
    existing.email = email || undefined;
    if (pin) existing.pinHash = hashPin(pin);
    existing.staffRole = staffRole;
    existing.active = active;
  } else {
    db.instructors.push({
      id: `i-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      role,
      bio: bio || undefined,
      photoUrl,
      email: email || undefined,
      pinHash: pin ? hashPin(pin) : undefined,
      staffRole,
      active,
    });
  }
  saveDB();
  revalidatePath("/admin/instructors");
  revalidatePath("/schedule");
  redirect("/admin/instructors?saved=1");
}

export async function removeInstructorPhoto(formData: FormData) {
  await ensureDB();
  requireOwner();
  const db = getDB();
  const inst = db.instructors.find((i) => i.id === String(formData.get("id")));
  if (inst) {
    inst.photoUrl = undefined;
    saveDB();
  }
  revalidatePath("/admin/instructors");
}

export async function staffLogin(formData: FormData) {
  await ensureDB();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const pin = String(formData.get("pin") ?? "").trim();
  const db = getDB();
  const staff = db.instructors.find((i) => (i.email ?? "").toLowerCase() === email && i.active !== false);
  const { pinMatches } = await import("@/lib/staff");
  if (!staff || !pinMatches(pin, staff.pinHash)) redirect("/staff/login?error=1");
  cookies().set("rx_staff", staff!.id, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 12 });
  if (staff!.staffRole === "owner") {
    cookies().set("rx_admin", "1", { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 12 });
  }
  redirect("/admin");
}

export async function staffLogout() {
  await ensureDB();
  cookies().delete("rx_staff");
  cookies().delete("rx_admin");
  redirect("/staff/login");
}
