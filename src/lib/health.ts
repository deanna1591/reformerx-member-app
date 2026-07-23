import { getDB } from "./store";
import { simplybookConfigured } from "./simplybook";

export type CheckLevel = "ok" | "warn" | "error" | "info";

export interface Check {
  level: CheckLevel;
  label: string;
  value?: string;
  /** Plain-language explanation of what breaks, and how to fix it. */
  detail?: string;
}

export interface HealthReport {
  setup: Check[];
  data: Check[];
  capacity: Check[];
  connection: Check[];
  demoMembers: number;
  problems: number;
  checkedAt: string;
}

const MERCH = /(ponožk|ponozk|sock|láhev|lahev|bottle|tričk|tricko|shirt|merch|taška|bag|ručník|rucnik|towel)/i;
const DEMO_IDS = ["m-you", "m-jana", "m-tomas", "m-eliska"];

export async function runHealthCheck(): Promise<HealthReport> {
  const db = getDB();
  const now = Date.now();

  /* ---------- setup ---------- */
  const env = (k: string) => Boolean((process.env[k] ?? "").trim());
  const setup: Check[] = [
    {
      level: simplybookConfigured() ? "ok" : "error",
      label: "SimplyBook connection",
      detail: simplybookConfigured()
        ? undefined
        : "Members, classes and passes can't sync. Add the SimplyBook credentials in Vercel.",
    },
    {
      level: env("SUPABASE_URL") && env("SUPABASE_SERVICE_ROLE_KEY") ? "ok" : "error",
      label: "Database",
      detail:
        env("SUPABASE_URL") && env("SUPABASE_SERVICE_ROLE_KEY")
          ? undefined
          : "Without this, everything resets when the server restarts. Add the Supabase settings in Vercel.",
    },
    {
      level: env("RESEND_API_KEY") ? "ok" : "error",
      label: "Member sign-in emails",
      detail: env("RESEND_API_KEY")
        ? (process.env.EMAIL_FROM ?? "").includes("resend.dev")
          ? "Using the test sender — only reaches the studio's own Resend address. Switch to noreply@reformerx.cz once the domain is verified."
          : undefined
        : "Members can't sign in — the six-digit code is never sent. Add the Resend key in Vercel.",
    },
    {
      level: env("STUDIO_TZ") ? "ok" : "warn",
      label: "Studio timezone",
      value: process.env.STUDIO_TZ ?? "not set",
      detail: env("STUDIO_TZ") ? undefined : "Class times may show two hours early. Set STUDIO_TZ to Europe/Prague.",
    },
    {
      level: process.env.SIMPLYBOOK_ALLOW_BOOKING === "1" ? "ok" : "warn",
      label: "Booking inside the app",
      value: process.env.SIMPLYBOOK_ALLOW_BOOKING === "1" ? "on" : "off",
      detail:
        process.env.SIMPLYBOOK_ALLOW_BOOKING === "1"
          ? undefined
          : "Members are sent to the SimplyBook page instead of booking in the app.",
    },
    {
      level: env("STAFF_PIN_SECRET") ? "ok" : "warn",
      label: "Instructor PINs",
      detail: env("STAFF_PIN_SECRET") ? undefined : "Staff sign-in still works, but is less secure.",
    },
    {
      level: env("VAPID_PRIVATE_KEY") ? "ok" : "warn",
      label: "Push notifications",
      detail: env("VAPID_PRIVATE_KEY") ? undefined : "Members won't get phone alerts for rewards or freed spots.",
    },
  ];

  /* ---------- data ---------- */
  const active = db.members.filter((m) => new Date(m.membershipExpires).getTime() > now);
  const withPass = db.members.filter((m) => m.passName);
  const upcoming = db.classes.filter((c) => new Date(c.startsAt).getTime() > now);
  const lastSyncRaw = db.settings.lastSync?.split("|")[0];
  const lastSyncAge = lastSyncRaw ? (now - new Date(lastSyncRaw).getTime()) / 3600000 : Infinity;
  const merch = (db.packages ?? []).filter((p) => MERCH.test(p.name));

  const data: Check[] = [
    { level: "info", label: "Members", value: `${db.members.length} (${active.length} active)` },
    { level: "info", label: "Members with a named pass", value: String(withPass.length) },
    { level: upcoming.length > 0 ? "ok" : "warn", label: "Upcoming classes", value: String(upcoming.length),
      detail: upcoming.length > 0 ? undefined : "No classes ahead — members have nothing to book. Check the SimplyBook timetable, then sync." },
    { level: "info", label: "Bookings on record", value: String(db.bookings.length) },
    { level: "info", label: "Instructors shown to members", value: String(db.instructors.filter((i) => i.active !== false).length) },
    { level: "info", label: "Passes in the shop", value: String((db.packages ?? []).length) },
    { level: "info", label: "Active challenges", value: String(db.challenges.filter((c) => c.active).length) },
    { level: "info", label: "App check-ins", value: String(db.checkIns.length) },
    {
      level: lastSyncAge < 26 ? "ok" : "warn",
      label: "Last sync with SimplyBook",
      value: lastSyncRaw ? new Date(lastSyncRaw).toLocaleString("en-GB") : "never",
      detail: lastSyncAge < 26 ? undefined : "Data may be out of date. Press “Sync from SimplyBook” on the Members page.",
    },
  ];
  if (merch.length > 0) {
    data.push({
      level: "warn",
      label: "Merchandise in the pass shop",
      value: merch.map((m) => m.name).slice(0, 3).join(", "),
      detail: "These are products, not passes. They disappear from the shop after the next sync.",
    });
  }

  /* ---------- capacity ---------- */
  const withCapacity = upcoming.filter((c) => typeof c.capacity === "number" && c.capacity > 0);
  const full = withCapacity.filter((c) => (c.spotsLeft ?? 1) <= 0);
  const waiting = (db.waitlist ?? []).filter((w) => w.status === "waiting" || w.status === "offered");
  const capacity: Check[] = [
    {
      level: withCapacity.length > 0 ? "ok" : "warn",
      label: "Classes with a place limit",
      value: `${withCapacity.length} of ${upcoming.length}`,
      detail:
        withCapacity.length > 0
          ? undefined
          : "No class has a maximum number of places, so nothing can ever show as full and the waitlist will never start. In SimplyBook go to Manage → Service providers → open each coach → set how many clients they can take at once (your number of reformers, mats or bikes), then press Sync here.",
    },
    { level: "info", label: "Classes full right now", value: String(full.length) },
    { level: "info", label: "Members on a waitlist", value: String(waiting.length) },
  ];

  /* ---------- connection ---------- */
  const connection: Check[] = [];
  if (simplybookConfigured()) {
    try {
      const base = (process.env.SIMPLYBOOK_API_BASE ?? "https://user-api-v2.simplybook.it").replace(/\/$/, "");
      const auth = (await fetch(`${base}/admin/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: (process.env.SIMPLYBOOK_COMPANY ?? "").trim(),
          login: (process.env.SIMPLYBOOK_LOGIN ?? "").trim(),
          password: (process.env.SIMPLYBOOK_USER_KEY ?? "").trim(),
        }),
        cache: "no-store",
      }).then((r) => r.json())) as { token?: string; message?: string };

      if (auth.token) {
        connection.push({ level: "ok", label: "SimplyBook sign-in", value: "working" });
        const headers = {
          "Content-Type": "application/json",
          "X-Company-Login": (process.env.SIMPLYBOOK_COMPANY ?? "").trim(),
          "X-Token": auth.token,
        };
        const provBody = (await fetch(`${base}/admin/providers?on_page=100`, { headers, cache: "no-store" }).then((r) =>
          r.json()
        )) as { data?: Array<{ name: string; qty?: number; is_active?: boolean }> } | Array<{ name: string; qty?: number; is_active?: boolean }>;
        const provs = (Array.isArray(provBody) ? provBody : provBody?.data ?? []).filter((p) => p.is_active !== false);
        const withQty = provs.filter((p) => typeof p.qty === "number" && p.qty > 1);
        connection.push({
          level: withQty.length > 0 ? "ok" : "warn",
          label: "Coaches with a class size set",
          value: `${withQty.length} of ${provs.length}`,
          detail:
            withQty.length > 0
              ? withQty.slice(0, 6).map((p) => `${p.name}: ${p.qty}`).join(" · ")
              : "In SimplyBook: Manage → Service providers → open each coach → set how many clients they can take at the same time.",
        });
      } else {
        connection.push({
          level: "error",
          label: "SimplyBook sign-in",
          value: auth.message ?? "failed",
          detail: "The app can't read members, classes or passes. Check the SimplyBook credentials in Vercel.",
        });
      }
    } catch (e) {
      connection.push({
        level: "error",
        label: "SimplyBook sign-in",
        value: e instanceof Error ? e.message.slice(0, 80) : "connection error",
      });
    }
  }

  const demoMembers = db.members.filter((m) => DEMO_IDS.includes(m.id)).length;
  const all = [...setup, ...data, ...capacity, ...connection];
  return {
    setup,
    data,
    capacity,
    connection,
    demoMembers,
    problems: all.filter((c) => c.level === "error" || c.level === "warn").length + (demoMembers > 0 ? 1 : 0),
    checkedAt: new Date().toISOString(),
  };
}
