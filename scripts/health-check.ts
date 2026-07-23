/* ReformerX health check — the same report as /admin/health, in the terminal.
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
  console.log("(no .env.local found — checking the current environment)\n");
}

const CLEAN = process.argv.includes("--clean-demo");
const MARK = { ok: "OK  ", warn: "  ! ", error: "  ! ", info: "    " } as const;

async function main() {
  const { ensureDB, getDB, saveDB } = await import("../src/lib/store");
  const { runHealthCheck } = await import("../src/lib/health");
  await ensureDB();
  const r = await runHealthCheck();

  const section = (title: string, checks: typeof r.setup) => {
    if (checks.length === 0) return;
    console.log(`\n=== ${title.toUpperCase()} ===`);
    for (const c of checks) {
      console.log(`  ${MARK[c.level]} ${c.label}${c.value ? `: ${c.value}` : ""}`);
      if (c.detail) {
        for (const line of c.detail.match(/.{1,88}(\s|$)/g) ?? []) console.log(`       ${line.trim()}`);
      }
    }
  };

  console.log(r.problems === 0 ? "\nEVERYTHING IS WORKING" : `\n${r.problems} THINGS NEED ATTENTION`);
  section("Setup", r.setup);
  section("SimplyBook", r.connection);
  section("Class places & waitlist", r.capacity);
  section("Studio data", r.data);

  console.log("\n=== DEMO DATA ===");
  if (r.demoMembers === 0) {
    console.log("  OK   no demo members — production is clean");
  } else if (CLEAN) {
    const db = getDB();
    const ids = new Set(["m-you", "m-jana", "m-tomas", "m-eliska"]);
    const before = db.bookings.length;
    db.members = db.members.filter((m) => !ids.has(m.id));
    db.bookings = db.bookings.filter((b) => !ids.has(b.memberId));
    db.checkIns = db.checkIns.filter((c) => !ids.has(c.memberId));
    db.challengeProgress = db.challengeProgress.filter((p) => !ids.has(p.memberId));
    db.earnedBadges = db.earnedBadges.filter((b) => !ids.has(b.memberId));
    db.earnedRewards = db.earnedRewards.filter((x) => !ids.has(x.memberId));
    db.notifications = db.notifications.filter((n) => !ids.has(n.memberId));
    db.waitlist = (db.waitlist ?? []).filter((w) => !ids.has(w.memberId));
    db.classes = db.classes.filter((c) => !c.id.startsWith("c-demo-"));
    saveDB();
    console.log(`   !   removed ${r.demoMembers} demo members and ${before - db.bookings.length} test bookings`);
  } else {
    console.log(`   !   ${r.demoMembers} demo members present — run with --clean-demo to remove them`);
  }

  console.log("\nThe studio can see this same report at /admin/health.\n");
}

main();
