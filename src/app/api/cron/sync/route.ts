import { NextRequest, NextResponse } from "next/server";
import { ensureDB, getDB, saveDB } from "@/lib/store";
import { syncFromSimplybook, simplybookConfigured } from "@/lib/simplybook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Scheduled sync (Vercel Cron). Keeps members, passes, bookings and the
 *  timetable current even if a webhook is missed — new SimplyBook clients get
 *  an app profile and QR code automatically. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const isVercelCron = req.headers.get("user-agent")?.includes("vercel-cron");
  if (secret && auth !== `Bearer ${secret}` && !isVercelCron) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!simplybookConfigured()) {
    return NextResponse.json({ ok: false, error: "SimplyBook not configured" }, { status: 200 });
  }

  await ensureDB();
  const before = getDB().members.length;
  // ?mode=full for the nightly run (members, passes, instructors);
  // default is the quick run — bookings, timetable and places only.
  const quick = new URL(req.url).searchParams.get("mode") !== "full";
  try {
    const result = await syncFromSimplybook({ quick });
    // Nudge anyone whose pass runs out shortly (once per pass)
    const { sendRenewalReminders, memberLocale, dueClassReminders, markReminderSent } = await import("@/lib/engine");
    const { sendPush } = await import("@/lib/push");
    const { translate } = await import("@/lib/i18n");

    // Pre-class nudge — runs on every sync so it lands close to the class
    let classReminders = 0;
    for (const r of dueClassReminders()) {
      if (!markReminderSent(r.bookingId, r.memberId, r.params)) continue;
      classReminders++;
      void sendPush(r.memberId, translate(memberLocale(r.memberId), "notif.classSoon", r.params));
    }

    // Anyone whose class the studio just cancelled gets a push too
    for (const n of getDB().notifications.slice(0, 40)) {
      if (n.key !== "notif.classCancelledByStudio" || n.read) continue;
      if (Date.now() - new Date(n.at).getTime() > 5 * 60000) continue; // only ones from this run
      void sendPush(n.memberId, translate(memberLocale(n.memberId), n.key, n.params ?? {}));
    }

    const reminders = quick ? { sent: 0, names: [] } : sendRenewalReminders();
    if (reminders.sent > 0) {
      for (const n of getDB().notifications.slice(0, reminders.sent)) {
        void sendPush(n.memberId, translate(memberLocale(n.memberId), (n.key ?? "notif.renewal") as never, n.params));
      }
    }
    const db = getDB();
    db.settings.lastSync = `${new Date().toISOString()}|${result.ok ? "ok" : "err"}|${result.message} (auto)`;
    saveDB();
    return NextResponse.json({
      ok: result.ok,
      message: result.message,
      mode: quick ? "quick" : "full",
      newMembers: db.members.length - before,
      renewalReminders: reminders.sent,
      classReminders,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "sync failed" }, { status: 500 });
  }
}
