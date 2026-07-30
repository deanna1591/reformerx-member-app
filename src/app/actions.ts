"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDB, saveDB, saveDBAsync, ensureDB, resetDB } from "@/lib/store";
import { performCheckIn, notify, notifyKey, CheckInResult, markBadgesCelebrated } from "@/lib/engine";
import { currentMember } from "@/lib/auth";
import { BUILTIN_BADGE_IDS } from "@/lib/badges";
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

  // Referral capture — only for genuinely new members (no class history at all),
  // and never self-referral. Existing members can't claim a code retroactively.
  if (referral && !member!.referredBy) {
    const { attendedClasses } = await import("@/lib/engine");
    const isNew = attendedClasses(member!.id).length === 0;
    const referrer = db.members.find((m) => m.qrCode.toUpperCase() === referral && m.id !== member!.id);
    if (isNew && referrer) {
      member!.referredBy = referrer.id;
      notifyKey(referrer.id, "notif.referralJoined", { name: member!.name.split(" ")[0] });
      notifyKey(member!.id, "notif.referralWelcome", { name: referrer.name.split(" ")[0] });
      await saveDBAsync();
      const { sendPush } = await import("@/lib/push");
      {
        const { translate } = await import("@/lib/i18n");
        const { memberLocale } = await import("@/lib/engine");
        void sendPush(
          referrer.id,
          translate(memberLocale(referrer.id), "notif.referralJoined", { name: member!.name.split(" ")[0] })
        );
      }
    } else if (referral && !referrer) {
      notifyKey(member!.id, "notif.referralNotFound", { code: referral });
      await saveDBAsync();
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
  await saveDBAsync();
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
    await saveDBAsync();
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
  await saveDBAsync();
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
  await saveDBAsync();
  revalidatePath("/admin/challenges");
  revalidatePath("/challenges");
}

export async function toggleChallenge(challengeId: string) {
  await ensureDB();
  requireAdmin();
  const db = getDB();
  const ch = db.challenges.find((c) => c.id === challengeId);
  if (ch) ch.active = !ch.active;
  await saveDBAsync();
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
    notifyKey(er.memberId, "notif.rewardReady", { reward: label });
    const { sendPush } = await import("@/lib/push");
    const { memberLocale } = await import("@/lib/engine");
    const { translate } = await import("@/lib/i18n");
    void sendPush(er.memberId, translate(memberLocale(er.memberId), "notif.rewardReady", { reward: er.reward }), "/rewards");
  }
  if (status === "collected") notifyKey(er.memberId, "notif.rewardCollected", { reward: er.reward, challenge: er.challengeName });
  if (status === "declined") notifyKey(er.memberId, "notif.rewardDeclined", { challenge: er.challengeName });
  await saveDBAsync();
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
  await saveDBAsync();
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
  notifyKey(memberId, "notif.membershipExtended", { date: new Date(m.membershipExpires).toLocaleDateString("en-GB") });
  await saveDBAsync();
  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath("/admin/members");
}

export async function sendMemberMessage(memberId: string, formData: FormData) {
  await ensureDB();
  requireAdmin();
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  notifyKey(memberId, "notif.staffMessage", { text });
  await saveDBAsync();
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
  await saveDBAsync();
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
  await saveDBAsync();
  const { sendPushToAll } = await import("@/lib/push");
  void sendPushToAll(`📣 ${text}`);
  revalidatePath("/admin");
}

export async function toggleLeaderboards() {
  await ensureDB();
  requireAdmin();
  const db = getDB();
  db.settings.leaderboardsEnabled = !db.settings.leaderboardsEnabled;
  await saveDBAsync();
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
      await saveDBAsync();
    } catch (e) {
      console.error("[sync] threw:", e);
      db.settings.lastSync = `${new Date().toISOString()}|err|${e instanceof Error ? e.message : "Sync failed"}`;
      await saveDBAsync();
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
    await saveDBAsync();
  }
  revalidatePath("/admin/members");
}

/**
 * DESTRUCTIVE. Replaces the entire database with seed data — it does not
 * "remove demo data", despite the old label. This wiped 991 real members once.
 *
 * No longer reachable from the admin UI. It also refuses outright whenever the
 * database contains SimplyBook-sourced members, so even a stray call can't
 * repeat that. Local demo resets still work on a database that only holds seed
 * data, which is the only case it was ever meant for.
 */
export async function resetDemoData() {
  await ensureDB();
  requireAdmin();
  const real = getDB().members.filter((m) => m.simplybookId).length;
  if (real > 0) {
    throw new Error(
      `resetDemoData refused: ${real} SimplyBook members present. This would destroy real data.`
    );
  }
  resetDB();
  revalidatePath("/", "layout");
}

/* ---------- admin member management ---------- */


/** Every screen that shows a member's bookings. Revalidating one and not the
 *  others is what made home and schedule disagree after a reschedule. */
function revalidateMemberViews(...classIds: Array<string | undefined>) {
  revalidatePath("/");
  revalidatePath("/schedule");
  revalidatePath("/profile");
  revalidatePath("/milestones");
  for (const id of classIds) if (id) revalidatePath(`/class/${id}`);
}

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

  // Credits are checked on the server too — the UI can be out of date
  const { canBook } = await import("@/lib/engine");
  const eligibility = canBook(member.id, classId);
  if (!eligibility.ok) {
    notifyKey(
      member.id,
      eligibility.reason === "no_credits"
        ? "notif.noCredits"
        : eligibility.reason === "daily_limit"
        ? "notif.dailyLimit"
        : "notif.noPass",
      { title: cls.title }
    );
    await saveDBAsync();
    revalidatePath("/schedule");
    return;
  }

  const { createSimplybookBooking, inAppBookingEnabled } = await import("@/lib/simplybook");
  if (!inAppBookingEnabled() || !cls.serviceId || !member.simplybookId) {
    notifyKey(member.id, "notif.bookExternally");
    await saveDBAsync();
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
    notifyKey(member.id, "notif.booked", { title: cls.title, when: new Date(cls.startsAt).toLocaleString() });
  } else {
    notifyKey(member.id, "notif.bookingFailed", { title: cls.title, reason: res.message });
  }
  await saveDBAsync();
  revalidateMemberViews(classId);
}

export async function cancelReservation(formData: FormData) {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");
  const classId = String(formData.get("classId") ?? "");
  const db = getDB();
  const booking = db.bookings.find((b) => b.memberId === member.id && b.classId === classId);
  if (!booking) return;

  // Bookings imported from SimplyBook carry their id in the field, and older
  // rows encode it in the app id (b-sb-1234) — use either.
  const cls = db.classes.find((c) => c.id === classId);
  const sbBookingId =
    booking.simplybookBookingId ?? (booking.id.startsWith("b-sb-") ? booking.id.slice(5) : undefined);

  if (sbBookingId) {
    const { cancelSimplybookBooking, inAppBookingEnabled } = await import("@/lib/simplybook");
    if (inAppBookingEnabled()) {
      const res = await cancelSimplybookBooking(sbBookingId);
      if (!res.ok) {
        // Never remove it locally if SimplyBook still holds the booking — the
        // member would think they had cancelled when they hadn't.
        notifyKey(member.id, "notif.cancelFailed", { reason: res.message });
        await saveDBAsync();
        revalidatePath(`/class/${classId}`);
        return;
      }
    } else {
      notifyKey(member.id, "notif.cancelExternally", { title: cls?.title ?? "class" });
      await saveDBAsync();
      revalidatePath(`/class/${classId}`);
      return;
    }
  }
  db.bookings = db.bookings.filter((b) => b !== booking);
  if (cls && typeof cls.spotsLeft === "number") cls.spotsLeft += 1;
  notifyKey(member.id, "notif.cancelled", { title: cls?.title ?? "class" });
  await saveDBAsync();

  revalidateMemberViews(classId);

  // Hand the freed spot to the next person waiting
  const { offerNextSpot } = await import("@/lib/engine");
  if (offerNextSpot(classId)) {
    const next = (getDB().waitlist ?? []).find((w) => w.classId === classId && w.status === "offered");
    if (next) {
      const { sendPush } = await import("@/lib/push");
      {
        const { translate } = await import("@/lib/i18n");
        const { memberLocale } = await import("@/lib/engine");
        void sendPush(
          next.memberId,
          translate(memberLocale(next.memberId), "notif.waitOffer", { title: cls?.title ?? "class", when: "" })
        );
      }
    }
  }
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
  const { canBook: canMove } = await import("@/lib/engine");
  const moveCheck = canMove(member.id, toId, fromId);
  if (!moveCheck.ok && moveCheck.reason === "daily_limit") {
    notifyKey(member.id, "notif.dailyLimit", { title: target.title });
    await saveDBAsync();
    return;
  }

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
      await saveDBAsync();
      return;
    }
    const oldSbId =
      booking.simplybookBookingId ?? (booking.id.startsWith("b-sb-") ? booking.id.slice(5) : undefined);
    if (oldSbId) await cancelSimplybookBooking(oldSbId);
    booking.simplybookBookingId = created.id;
  }

  booking.classId = toId;
  booking.bookedAt = new Date().toISOString();
  notifyKey(member.id, "notif.moved", { title: target.title, when: new Date(target.startsAt).toLocaleString() });
  await saveDBAsync();
  revalidateMemberViews(fromId, toId);
  redirect(`/class/${encodeURIComponent(toId)}`);
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

  // Photo upload → Supabase Storage. Inline data URLs made this collection the
  // largest in the database, and ensureDB() loads all of it on every render.
  let photoUrl = photoUrlField || undefined;
  const file = formData.get("photo");
  if (file && typeof file === "object" && "size" in file && (file as File).size > 0) {
    if ((file as File).size <= 4_000_000) {
      const { uploadFormImage } = await import("@/lib/storage");
      photoUrl = (await uploadFormImage(file, "instructors")) ?? photoUrl;
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
  await saveDBAsync();
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
    await saveDBAsync();
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

/* ---------- promotions ---------- */

export async function savePromotion(formData: FormData) {
  await ensureDB();
  requireOwner();
  const db = getDB();
  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v.length ? v : undefined;
  };
  const dateVal = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v ? new Date(`${v}T00:00:00`).toISOString() : undefined;
  };

  let imageUrl = str("imageUrl");
  const file = formData.get("image");
  if (file && typeof file === "object" && "size" in file && (file as File).size > 0) {
    if ((file as File).size <= 4_000_000) {
      const { uploadFormImage } = await import("@/lib/storage");
      imageUrl = (await uploadFormImage(file, "promotions")) ?? imageUrl;
    }
  }

  db.promotions = db.promotions ?? [];
  const existing = id ? db.promotions.find((x) => x.id === id) : undefined;
  const fields = {
    title,
    subtitle: str("subtitle"),
    body: str("body"),
    linkUrl: str("linkUrl"),
    linkLabel: str("linkLabel"),
    badge: str("badge"),
    startsAt: dateVal("startsAt"),
    endsAt: dateVal("endsAt"),
    active: formData.get("active") !== null,
    order: Number(formData.get("order") ?? 0) || 0,
  };

  if (existing) {
    Object.assign(existing, fields);
    if (imageUrl) existing.imageUrl = imageUrl;
  } else {
    db.promotions.push({
      id: `promo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      imageUrl,
      createdAt: new Date().toISOString(),
      ...fields,
    });
  }
  await saveDBAsync();
  revalidatePath("/admin/promotions");
  revalidatePath("/");
  redirect("/admin/promotions?saved=1");
}

export async function deletePromotion(formData: FormData) {
  await ensureDB();
  requireOwner();
  const db = getDB();
  db.promotions = (db.promotions ?? []).filter((p) => p.id !== String(formData.get("id")));
  await saveDBAsync();
  revalidatePath("/admin/promotions");
  revalidatePath("/");
}

export async function movePromotion(formData: FormData) {
  await ensureDB();
  requireOwner();
  const db = getDB();
  const promo = (db.promotions ?? []).find((p) => p.id === String(formData.get("id")));
  if (promo) {
    promo.order += String(formData.get("dir")) === "up" ? -1.5 : 1.5;
    db.promotions = (db.promotions ?? [])
      .sort((a, b) => a.order - b.order)
      .map((p, i) => ({ ...p, order: i }));
    await saveDBAsync();
  }
  revalidatePath("/admin/promotions");
  revalidatePath("/");
}

/* ---------- waitlist ---------- */

export async function joinWaitlist(formData: FormData) {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");
  const classId = String(formData.get("classId") ?? "");
  const db = getDB();
  const cls = db.classes.find((c) => c.id === classId);
  if (!cls) return;

  const { memberWaitlistEntry } = await import("@/lib/engine");
  if (memberWaitlistEntry(member.id, classId)) return; // already queued
  if (db.bookings.some((b) => b.memberId === member.id && b.classId === classId)) return; // already booked

  db.waitlist = db.waitlist ?? [];
  db.waitlist.push({
    id: `wl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    memberId: member.id,
    classId,
    joinedAt: new Date().toISOString(),
    status: "waiting",
  });
  notifyKey(member.id, "notif.waitJoined", { title: cls.title });
  await saveDBAsync();
  revalidatePath(`/class/${classId}`);
  revalidatePath("/schedule");
  revalidatePath("/");
}

export async function leaveWaitlist(formData: FormData) {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");
  const classId = String(formData.get("classId") ?? "");
  const db = getDB();
  const entry = (db.waitlist ?? []).find(
    (w) => w.memberId === member.id && w.classId === classId && (w.status === "waiting" || w.status === "offered")
  );
  if (!entry) return;
  const wasOffered = entry.status === "offered";
  db.waitlist = (db.waitlist ?? []).filter((w) => w.id !== entry.id);
  await saveDBAsync();
  if (wasOffered) {
    const { offerNextSpot } = await import("@/lib/engine");
    offerNextSpot(classId); // pass the spot straight on
  }
  revalidatePath(`/class/${classId}`);
  revalidatePath("/schedule");
  revalidatePath("/");
}

export async function confirmWaitlistOffer(formData: FormData) {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");
  const classId = String(formData.get("classId") ?? "");
  const db = getDB();
  const cls = db.classes.find((c) => c.id === classId);
  const entry = (db.waitlist ?? []).find(
    (w) => w.memberId === member.id && w.classId === classId && w.status === "offered"
  );
  if (!cls || !entry) return;

  if (entry.offerExpiresAt && new Date(entry.offerExpiresAt).getTime() < Date.now()) {
    entry.status = "expired";
    notifyKey(member.id, "notif.waitExpired", { title: cls.title });
    await saveDBAsync();
    const { offerNextSpot } = await import("@/lib/engine");
    offerNextSpot(classId);
    revalidatePath(`/class/${classId}`);
    return;
  }

  const { canBook } = await import("@/lib/engine");
  const claim = canBook(member.id, classId);
  if (!claim.ok) {
    notifyKey(member.id, claim.reason === "daily_limit" ? "notif.dailyLimit" : "notif.noCredits", { title: cls.title });
    await saveDBAsync();
    revalidatePath(`/class/${classId}`);
    return;
  }

  const { createSimplybookBooking, inAppBookingEnabled } = await import("@/lib/simplybook");
  if (inAppBookingEnabled() && member.simplybookId && cls.serviceId) {
    const res = await createSimplybookBooking({
      clientId: member.simplybookId,
      serviceId: cls.serviceId,
      unitId: cls.unitId,
      startsAt: cls.startsAt,
      durationMin: cls.durationMin,
    });
    if (!res.ok) {
      notifyKey(member.id, "notif.waitClaimFailed", { reason: res.message });
      await saveDBAsync();
      revalidatePath(`/class/${classId}`);
      return;
    }
    db.bookings.push({
      id: `b-wl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      memberId: member.id,
      classId,
      source: "app",
      simplybookBookingId: res.id,
      bookedAt: new Date().toISOString(),
    });
  } else {
    db.bookings.push({
      id: `b-wl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      memberId: member.id,
      classId,
      source: "app",
      bookedAt: new Date().toISOString(),
    });
  }

  entry.status = "confirmed";
  if (typeof cls.spotsLeft === "number") cls.spotsLeft = Math.max(0, cls.spotsLeft - 1);
  notifyKey(member.id, "notif.waitConfirmed", { title: cls.title });
  await saveDBAsync();
  revalidatePath(`/class/${classId}`);
  revalidatePath("/schedule");
  revalidatePath("/");
  redirect(`/class/${encodeURIComponent(classId)}`);
}

export async function declineWaitlistOffer(formData: FormData) {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");
  const classId = String(formData.get("classId") ?? "");
  const db = getDB();
  const entry = (db.waitlist ?? []).find(
    (w) => w.memberId === member.id && w.classId === classId && w.status === "offered"
  );
  if (!entry) return;
  entry.status = "declined";
  await saveDBAsync();
  const { offerNextSpot } = await import("@/lib/engine");
  offerNextSpot(classId);
  revalidatePath(`/class/${classId}`);
  revalidatePath("/");
}

/* ---------- language ---------- */

export async function setLanguage(formData: FormData) {
  await ensureDB();
  const lang = String(formData.get("lang") ?? "en");
  const value = lang === "cs" ? "cs" : "en";
  cookies().set("rx_lang", value, { sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/" });
  const member = currentMember();
  if (member) {
    const m = getDB().members.find((x) => x.id === member.id);
    if (m) {
      m.locale = value;
      await saveDBAsync();
    }
  }
  revalidatePath("/", "layout");
  redirect("/settings");
}

export async function setAdminLanguage(formData: FormData) {
  const lang = String(formData.get("lang") ?? "en");
  cookies().set("rx_lang", lang === "cs" ? "cs" : "en", {
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  revalidatePath("/admin", "layout");
  redirect("/admin");
}

export async function cleanDemoData() {
  await ensureDB();
  requireOwner();
  const db = getDB();
  const ids = new Set(["m-you", "m-jana", "m-tomas", "m-eliska"]);
  db.members = db.members.filter((m) => !ids.has(m.id));
  db.bookings = db.bookings.filter((b) => !ids.has(b.memberId));
  db.checkIns = db.checkIns.filter((c) => !ids.has(c.memberId));
  db.challengeProgress = db.challengeProgress.filter((p) => !ids.has(p.memberId));
  db.earnedBadges = db.earnedBadges.filter((b) => !ids.has(b.memberId));
  db.earnedRewards = db.earnedRewards.filter((r) => !ids.has(r.memberId));
  db.notifications = db.notifications.filter((n) => !ids.has(n.memberId));
  db.waitlist = (db.waitlist ?? []).filter((w) => !ids.has(w.memberId));
  db.classes = db.classes.filter((c) => !c.id.startsWith("c-demo-"));
  await saveDBAsync();
  revalidatePath("/admin/health");
  revalidatePath("/admin/members");
}

export async function sendRenewalRemindersNow() {
  await ensureDB();
  requireOwner();
  const { sendRenewalReminders, memberLocale } = await import("@/lib/engine");
  const result = sendRenewalReminders();
  if (result.sent > 0) {
    const { sendPush } = await import("@/lib/push");
    const { translate } = await import("@/lib/i18n");
    const db = getDB();
    for (const n of db.notifications.slice(0, result.sent)) {
      void sendPush(n.memberId, translate(memberLocale(n.memberId), (n.key ?? "notif.renewal") as never, n.params));
    }
  }
  revalidatePath("/admin/passes");
  redirect(`/admin/passes?sent=${result.sent}`);
}

/* ---------- challenge management ---------- */

export async function deleteChallenge(formData: FormData) {
  await ensureDB();
  requireOwner();
  const db = getDB();
  const id = String(formData.get("challengeId") ?? "");
  const joined = db.challengeProgress.filter((p) => p.challengeId === id).length;
  // Never delete a challenge members are already playing — their progress and
  // any reward they earned would vanish. Deactivating hides it instead.
  if (joined > 0) {
    const ch = db.challenges.find((c) => c.id === id);
    if (ch) ch.active = false;
    await saveDBAsync();
    revalidatePath("/admin/challenges");
    return;
  }
  db.challenges = db.challenges.filter((c) => c.id !== id);
  await saveDBAsync();
  revalidatePath("/admin/challenges");
  revalidatePath("/challenges");
}

/** One-tap set-up: the five challenges we'd recommend a studio start with. */
export async function addStarterChallenges() {
  await ensureDB();
  requireOwner();
  const db = getDB();
  const iso = (d: Date) => d.toISOString();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const starters: Array<Omit<Challenge, "id">> = [
    {
      name: "12 in 30",
      emoji: "🔥",
      description:
        "Twelve classes in thirty days. Roughly three a week — the rhythm where people stop thinking about it and it just becomes their week.",
      type: "class_count",
      goal: 12,
      startDate: undefined,
      endDate: undefined,
      reward: "Free ReformerX grip socks",
      rewardEmoji: "🧦",
      springColor: "red",
      leaderboard: false,
      active: true,
    },
    {
      name: "7-Day Streak",
      emoji: "⚡",
      description: "A class every day for seven days straight. Short, sharp, and the one people talk about.",
      type: "streak_days",
      goal: 7,
      startDate: undefined,
      endDate: undefined,
      reward: "Coffee or smoothie on the house",
      rewardEmoji: "☕",
      springColor: "yellow",
      leaderboard: true,
      active: true,
    },
    {
      name: "Meet the Team",
      emoji: "🤝",
      description:
        "Take a class with five different coaches. A gentle nudge towards the quieter slots — and people usually find a new favourite.",
      type: "instructor_variety",
      goal: 5,
      startDate: undefined,
      endDate: undefined,
      reward: "One free class credit",
      rewardEmoji: "🎟️",
      springColor: "blue",
      leaderboard: false,
      active: true,
    },
    {
      name: "Bring a Friend",
      emoji: "💛",
      description:
        "Share your member code. When a friend joins with it and takes their first class, you both win.",
      type: "referrals",
      goal: 1,
      startDate: undefined,
      endDate: undefined,
      reward: "A free class for you both",
      rewardEmoji: "🎁",
      springColor: "green",
      leaderboard: false,
      active: true,
    },
    {
      name: "Monthly Rhythm",
      emoji: "📅",
      description: "Eight classes before the month is out. Resets on the first — a fresh start every month.",
      type: "monthly_count",
      goal: 8,
      startDate: iso(monthStart),
      endDate: iso(monthEnd),
      reward: "Entry to the monthly member draw",
      rewardEmoji: "🎉",
      springColor: "red",
      leaderboard: true,
      active: true,
    },
  ];

  let added = 0;
  for (const s of starters) {
    if (db.challenges.some((c) => c.name.toLowerCase() === s.name.toLowerCase())) continue;
    db.challenges.push({
      ...s,
      id: `ch-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2, 5)}`,
    });
    added++;
  }
  await saveDBAsync();
  revalidatePath("/admin/challenges");
  redirect(`/admin/challenges?added=${added}`);
}


/** Called by the home-screen celebration once the member has seen their badges. */
export async function dismissBadgeCelebration(): Promise<void> {
  const member = await currentMember();
  if (!member) return;
  await ensureDB();
  markBadgesCelebrated(member.id);
  await saveDBAsync();
  revalidatePath("/");
}


/** Owner-created badge. Awards automatically once a member hits the class count. */
export async function saveBadge(fd: FormData): Promise<void> {
  const { isOwner } = require("@/lib/staff") as typeof import("@/lib/staff");
  if (!isOwner()) return;
  await ensureDB();
  const db = getDB();
  const name = String(fd.get("name") ?? "").trim().slice(0, 40);
  const description = String(fd.get("description") ?? "").trim().slice(0, 120);
  const classesRequired = Math.max(1, Math.min(2000, parseInt(String(fd.get("classesRequired") ?? "0"), 10) || 0));
  const imageUrl = String(fd.get("imageUrl") ?? "");
  if (!name || !classesRequired) return;
  // The browser sends a data URL; move it straight to Storage so the badge row
  // holds a link rather than the bytes. Eighteen inline badges would otherwise
  // be megabytes on every page render.
  let safeImage: string | undefined;
  if (imageUrl.startsWith("data:image/") && imageUrl.length < 6_000_000) {
    const { uploadDataUrl } = await import("@/lib/storage");
    safeImage = (await uploadDataUrl(imageUrl, "badges")) ?? undefined;
  }

  db.badgeDefs.push({
    id: `bd-custom-${Date.now().toString(36)}`,
    name,
    description,
    emoji: safeImage ? "🏆" : "🏆",
    imageUrl: safeImage,
    classesRequired,
    custom: true,
  });
  await saveDBAsync();
  revalidatePath("/admin/badges");
}

export async function deleteBadge(fd: FormData): Promise<void> {
  const { isOwner } = require("@/lib/staff") as typeof import("@/lib/staff");
  if (!isOwner()) return;
  await ensureDB();
  const db = getDB();
  const badgeId = String(fd.get("badgeId") ?? "");
  if (!badgeId || BUILTIN_BADGE_IDS.has(badgeId)) return; // built-ins are code, not data
  db.badgeDefs = db.badgeDefs.filter((b) => b.id !== badgeId);
  db.earnedBadges = db.earnedBadges.filter((b) => b.badgeId !== badgeId);
  await saveDBAsync();
  revalidatePath("/admin/badges");
}


/* ---------- studio email ---------- */

/**
 * Send a message to one member or to a filtered group.
 *
 * Resend's API takes one recipient per call, so a broadcast is a loop. It runs
 * in small batches with a pause between them: Resend rate-limits, and firing 998
 * requests at once gets a chunk of them rejected. Every failure is counted and
 * reported rather than swallowed — a half-delivered broadcast the admin thinks
 * went out is worse than an obvious error.
 *
 * Deliberately not a background job: on Hobby the function is capped at 60s, so
 * the admin sees a real result instead of a fire-and-forget that may have died.
 */
export async function sendStudioEmail(formData: FormData) {
  await ensureDB();
  requireOwner();
  const db = getDB();

  const subject = String(formData.get("subject") ?? "").trim().slice(0, 150);
  const body = String(formData.get("body") ?? "").trim().slice(0, 5000);
  const audience = String(formData.get("audience") ?? "one");
  const memberId = String(formData.get("memberId") ?? "");
  const ctaLabel = String(formData.get("ctaLabel") ?? "").trim().slice(0, 40);
  const ctaUrl = String(formData.get("ctaUrl") ?? "").trim().slice(0, 300);

  if (!subject || !body) redirect("/admin/email?error=missing");

  const { membershipActive } = await import("@/lib/engine");
  let recipients =
    audience === "one"
      ? db.members.filter((m) => m.id === memberId)
      : audience === "active"
        ? db.members.filter((m) => membershipActive(m))
        : audience === "expired"
          ? db.members.filter((m) => !membershipActive(m))
          : db.members.slice();

  // No address, nothing to send to. The placeholder addresses the dev seeder
  // writes must never receive anything either.
  recipients = recipients.filter(
    (m) => m.email && m.email.includes("@") && !m.email.endsWith("@example.invalid")
  );

  if (recipients.length === 0) redirect("/admin/email?error=norecipients");

  const { sendEmail, studioMessageEmail, emailConfigured } = await import("@/lib/email");
  if (!emailConfigured()) redirect("/admin/email?error=notconfigured");

  let sent = 0;
  let failed = 0;
  const BATCH = 8;
  for (let i = 0; i < recipients.length; i += BATCH) {
    const slice = recipients.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map((m) => {
        const msg = studioMessageEmail({
          name: m.name,
          subject,
          body,
          ctaLabel: ctaLabel || undefined,
          ctaUrl: ctaUrl || undefined,
        });
        return sendEmail(m.email, msg.subject, msg.html, msg.text).catch(() => false);
      })
    );
    for (const r of results) (r ? sent++ : failed++);
    if (i + BATCH < recipients.length) await new Promise((r) => setTimeout(r, 600));
  }

  // Mirror it in-app so a member who missed the email still sees it.
  if (audience !== "one") {
    for (const m of recipients) notify(m.id, `${subject}`);
    await saveDBAsync();
  }

  revalidatePath("/admin/email");
  redirect(`/admin/email?sent=${sent}${failed ? `&failed=${failed}` : ""}`);
}


/**
 * Edit an existing challenge.
 *
 * Only while nobody has joined. Once a member is part-way through, changing the
 * goal or the rule silently rewrites what they signed up for — someone at 8/10
 * could drop to 8/20, or a rolling window could become a fixed one and wipe
 * their progress. The rules are read live by computeProgress, so there is no
 * record of what the challenge used to be.
 *
 * Reward text and dates stay editable regardless; those don't change the maths.
 */
export async function updateChallenge(formData: FormData) {
  await ensureDB();
  requireOwner();
  const db = getDB();

  const id = String(formData.get("id") ?? "");
  const ch = db.challenges.find((c) => c.id === id);
  if (!ch) redirect("/admin/challenges?error=notfound");

  const joined = db.challengeProgress.filter((p) => p.challengeId === id).length;

  // Always safe to change — presentation and reward, not scoring.
  ch.name = String(formData.get("name") ?? ch.name).slice(0, 60) || ch.name;
  ch.emoji = String(formData.get("emoji") || ch.emoji).slice(0, 4);
  ch.description = String(formData.get("description") ?? ch.description).slice(0, 300);
  ch.reward = String(formData.get("reward") ?? ch.reward).slice(0, 120);
  ch.springColor = (formData.get("springColor") as Challenge["springColor"]) ?? ch.springColor;
  ch.leaderboard = formData.get("leaderboard") === "on";

  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  if (startDate) ch.startDate = new Date(startDate).toISOString();
  if (endDate) ch.endDate = new Date(endDate).toISOString();

  // Scoring rules — only with nobody mid-challenge.
  if (joined === 0) {
    const type = formData.get("type") as Challenge["type"] | null;
    if (type) ch.type = type;
    const goal = Number(formData.get("goal"));
    if (Number.isFinite(goal) && goal >= 0) ch.goal = Math.floor(goal);
    const windowDays = Number(formData.get("windowDays"));
    if (Number.isFinite(windowDays) && windowDays > 0) ch.windowDays = Math.floor(windowDays);
    if (ch.type === "rolling_count") {
      // A rolling window measures from each member's join date; leftover fixed
      // dates would be read as a second, conflicting constraint.
      delete ch.startDate;
      delete ch.endDate;
    }
  }

  await saveDBAsync();
  revalidatePath("/admin/challenges");
  revalidatePath("/challenges");
  redirect(`/admin/challenges?updated=${encodeURIComponent(ch.name)}${joined > 0 ? "&locked=1" : ""}`);
}
