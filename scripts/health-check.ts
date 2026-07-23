/* ReformerX health check — one command, plain answers.
 *
 *   npx tsx scripts/health-check.ts               → report only
 *   npx tsx scripts/health-check.ts --clean-demo  → also remove demo members
 */
import { readFileSync } from "fs";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].split("#")[0].trim().replace(/^["']|["']$/g, "");
  }
} catch {
  console.log("(no .env.local found — checking what is in the environment)\n");
}

const CLEAN = process.argv.includes("--clean-demo");
const V2 = "https://user-api-v2.simplybook.it";
const ok = (b: boolean) => (b ? "OK  " : "  ! ");

async function main() {
  const { ensureDB, getDB, saveDB } = await import("../src/lib/store");
  await ensureDB();
  const db = getDB();
  const now = Date.now();

  console.log("=== CONFIGURATION ===");
  const cfg: Array<[string, boolean, string]> = [
    ["SimplyBook credentials", Boolean(process.env.SIMPLYBOOK_COMPANY && process.env.SIMPLYBOOK_USER_KEY), ""],
    ["Supabase persistence", Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY), "data survives restarts"],
    ["Studio timezone", Boolean(process.env.STUDIO_TZ), process.env.STUDIO_TZ ?? "defaults to Europe/Prague"],
    ["Email sending (Resend)", Boolean(process.env.RESEND_API_KEY), "members can't sign in without it"],
    ["In-app booking", process.env.SIMPLYBOOK_ALLOW_BOOKING === "1", "otherwise Reserve opens SimplyBook"],
    ["Staff PIN salt", Boolean(process.env.STAFF_PIN_SECRET), "must match Vercel exactly"],
    ["Push notifications", Boolean(process.env.VAPID_PRIVATE_KEY), ""],
  ];
  for (const [label, good, note] of cfg) {
    console.log(`  ${ok(good)} ${label.padEnd(24)} ${good ? "" : note}`);
  }
  const from = process.env.EMAIL_FROM ?? "";
  if (from.includes("resend.dev")) {
    console.log("      ↳ EMAIL_FROM is the Resend test sender: only delivers to your Resend account address");
  } else if (from) {
    console.log(`      ↳ EMAIL_FROM: ${from}`);
  }

  console.log("\n=== DATA ===");
  const active = db.members.filter((m) => new Date(m.membershipExpires).getTime() > now);
  const withPass = db.members.filter((m) => m.passName);
  const futureClasses = db.classes.filter((c) => new Date(c.startsAt).getTime() > now);
  console.log(`  members            ${db.members.length} (${active.length} active, ${withPass.length} with a named pass)`);
  console.log(`  classes            ${db.classes.length} (${futureClasses.length} upcoming)`);
  console.log(`  bookings           ${db.bookings.length}`);
  console.log(`  instructors        ${db.instructors.length} (${db.instructors.filter((i) => i.active !== false).length} visible)`);
  console.log(`  passes in store    ${(db.packages ?? []).length}`);
  console.log(`  promotions         ${(db.promotions ?? []).filter((p) => p.active).length} active`);
  console.log(`  challenges         ${db.challenges.filter((c) => c.active).length} active`);
  console.log(`  app check-ins      ${db.checkIns.length}`);

  console.log("\n=== CLASS CAPACITY (waitlist depends on this) ===");
  const withCapacity = futureClasses.filter((c) => typeof c.capacity === "number" && c.capacity > 0);
  const full = withCapacity.filter((c) => (c.spotsLeft ?? 1) <= 0);
  console.log(`  ${ok(withCapacity.length > 0)} upcoming classes with a capacity: ${withCapacity.length} of ${futureClasses.length}`);
  console.log(`      full right now: ${full.length}`);
  if (withCapacity.length === 0) {
    console.log("      → No service has 'Limit bookings' set in SimplyBook, so no class can ever be");
    console.log("        marked full and the waitlist will never trigger. Set it per service in");
    console.log("        SimplyBook → Services → (each class) → Limit bookings.");
  } else {
    for (const c of withCapacity.slice(0, 5)) {
      console.log(`      ${c.startsAt.slice(0, 16).replace("T", " ")}  ${c.title.slice(0, 28).padEnd(28)} ${c.spotsLeft}/${c.capacity} free`);
    }
  }
  console.log(`  waitlist entries:  ${(db.waitlist ?? []).filter((w) => w.status === "waiting" || w.status === "offered").length}`);

  console.log("\n=== DEMO DATA ===");
  const DEMO_IDS = ["m-you", "m-jana", "m-tomas", "m-eliska"];
  const demos = db.members.filter((m) => DEMO_IDS.includes(m.id));
  if (demos.length === 0) {
    console.log("  OK   no demo members — production is clean");
  } else {
    console.log(`   !   ${demos.length} demo members present: ${demos.map((m) => m.name).join(", ")}`);
    if (CLEAN) {
      const ids = new Set(demos.map((m) => m.id));
      const beforeB = db.bookings.length;
      db.members = db.members.filter((m) => !ids.has(m.id));
      db.bookings = db.bookings.filter((b) => !ids.has(b.memberId));
      db.checkIns = db.checkIns.filter((c) => !ids.has(c.memberId));
      db.challengeProgress = db.challengeProgress.filter((p) => !ids.has(p.memberId));
      db.earnedBadges = db.earnedBadges.filter((b) => !ids.has(b.memberId));
      db.earnedRewards = db.earnedRewards.filter((r) => !ids.has(r.memberId));
      db.notifications = db.notifications.filter((n) => !ids.has(n.memberId));
      db.waitlist = (db.waitlist ?? []).filter((w) => !ids.has(w.memberId));
      db.classes = db.classes.filter((c) => !c.id.startsWith("c-demo-"));
      saveDB();
      console.log(`      removed — ${beforeB - db.bookings.length} demo bookings cleared too`);
    } else {
      console.log("      run with --clean-demo to remove them and their bookings");
    }
  }

  console.log("\n=== SIMPLYBOOK CONNECTION ===");
  try {
    const auth = await fetch(`${V2}/admin/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: process.env.SIMPLYBOOK_COMPANY,
        login: process.env.SIMPLYBOOK_LOGIN,
        password: process.env.SIMPLYBOOK_USER_KEY,
      }),
    }).then((r) => r.json());
    console.log(`  ${ok(Boolean(auth.token))} authentication ${auth.token ? "works" : `FAILED: ${auth.message ?? "unknown"}`}`);
    if (auth.token) {
      const H = { "Content-Type": "application/json", "X-Company-Login": process.env.SIMPLYBOOK_COMPANY as string, "X-Token": auth.token };
      const svcRes = await fetch(`${V2}/admin/services?on_page=100`, { headers: H });
      const svcBody = await svcRes.json().catch(() => null);
      const services: Array<{ name: string; limit_booking?: number | null; is_active?: boolean }> =
        Array.isArray(svcBody) ? svcBody : svcBody?.data ?? [];
      const limited = services.filter((s) => typeof s.limit_booking === "number" && s.limit_booking > 0);
      console.log(`  ${ok(limited.length > 0)} services with a booking limit: ${limited.length} of ${services.filter((s) => s.is_active !== false).length} active`);
      for (const s of services.filter((s) => s.is_active !== false).slice(0, 8)) {
        console.log(`      ${(s.name ?? "?").slice(0, 30).padEnd(32)} limit: ${s.limit_booking ?? "not set"}`);
      }
    }
  } catch (e) {
    console.log("   !  connection error:", e instanceof Error ? e.message : e);
  }

  console.log(`\n  last sync: ${db.settings.lastSync?.split("|")[0]?.slice(0, 19).replace("T", " ") ?? "never"}`);
  console.log("\nDone.");
}

main();
