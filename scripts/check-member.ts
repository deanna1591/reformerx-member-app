/* Show what the app computes for one member. No API calls — reads the store.
   Usage: npx tsx scripts/check-member.ts 303        (SimplyBook client id)
          npx tsx scripts/check-member.ts deanna     (name or email fragment) */
import { readFileSync } from "fs";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].split("#")[0].trim().replace(/^["']|["']$/g, "");
  }
} catch {
  /* no env file: local store only */
}

async function main() {
  const { ensureDB, getDB } = await import("../src/lib/store");
  const { memberActivity, membershipActive } = await import("../src/lib/engine");
  await ensureDB();
  const db = getDB();

  const needle = (process.argv[2] ?? "").toLowerCase();
  if (!needle) {
    console.log("pass a SimplyBook client id, name, or email fragment");
    return;
  }
  const matches = db.members.filter(
    (m) =>
      m.simplybookId === needle ||
      m.name.toLowerCase().includes(needle) ||
      m.email.toLowerCase().includes(needle)
  );
  if (matches.length === 0) {
    console.log("no member matched:", needle);
    return;
  }

  for (const m of matches.slice(0, 5)) {
    const act = memberActivity(m.id);
    const now = Date.now();
    const mine = db.bookings.filter((b) => b.memberId === m.id);
    const past = mine.filter((b) => {
      const c = db.classes.find((x) => x.id === b.classId);
      return c && new Date(c.startsAt).getTime() < now;
    });
    console.log(`\n${m.name.slice(0, 2)}*** (${m.id}, SimplyBook #${m.simplybookId ?? "—"})`);
    console.log(`  membership     : ${m.membershipType}, ${membershipActive(m) ? "active" : "inactive"} until ${m.membershipExpires.slice(0, 10)}`);
    console.log(`  ATTENDED       : ${act.attended}   <-- compare with SimplyBook's confirmed count`);
    console.log(`  bookings stored: ${mine.length} (past: ${past.length}, upcoming: ${act.upcoming})`);
    console.log(`  app check-ins  : ${act.checkIns}`);
    console.log(`  challenges     : ${act.challengesJoined} joined, ${act.challengesCompleted} completed`);
  }
  console.log(`\nstore totals: ${db.members.length} members, ${db.bookings.length} bookings, ${db.classes.length} classes`);
}

main();
