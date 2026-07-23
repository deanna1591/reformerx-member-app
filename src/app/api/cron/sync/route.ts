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
  try {
    const result = await syncFromSimplybook();
    // Nudge anyone whose pass runs out shortly (once per pass)
    const { sendRenewalReminders, memberLocale } = await import("@/lib/engine");
    const reminders = sendRenewalReminders();
    if (reminders.sent > 0) {
      const { sendPush } = await import("@/lib/push");
      const { translate } = await import("@/lib/i18n");
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
      newMembers: db.members.length - before,
      renewalReminders: reminders.sent,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "sync failed" }, { status: 500 });
  }
}
