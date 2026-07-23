/* Cross-check class → instructor assignments against SimplyBook.
   Read-only. Run:  npx tsx scripts/verify-instructors.ts [days]   (default 400) */
import { readFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].split("#")[0].trim().replace(/^["']|["']$/g, "");
}

const DAYS = Number(process.argv[2] ?? 400);
const V2 = "https://user-api-v2.simplybook.it";
const RPC = "https://user-api.simplybook.it/admin";

async function main() {
  const { ensureDB, getDB } = await import("../src/lib/store");
  const { studioToISO } = await import("../src/lib/time");

  const auth = await fetch(`${V2}/admin/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company: process.env.SIMPLYBOOK_COMPANY,
      login: process.env.SIMPLYBOOK_LOGIN,
      password: process.env.SIMPLYBOOK_USER_KEY,
    }),
  }).then((r) => r.json());
  if (!auth.token) return console.log("AUTH FAILED", auth);
  const H = {
    "Content-Type": "application/json",
    "X-Company-Login": process.env.SIMPLYBOOK_COMPANY as string,
    "X-Token": auth.token,
    "X-User-Token": auth.token,
  };
  console.log(`auth ok — checking ${DAYS} days of bookings\n`);

  // 1 — SimplyBook truth: for each (service, start) which unit teaches it
  type B = { event_id?: string; start_date?: string; unit_id?: string; unit?: string; event?: string; is_confirm?: string };
  const truth = new Map<string, { unitIds: Set<string>; unitNames: Set<string>; event?: string }>();
  const sbUnitCounts = new Map<string, { name: string; classes: Set<string> }>();

  const endMs = Date.now() + 14 * 86400000;
  const startMs = Date.now() - DAYS * 86400000;
  const CHUNK = 30 * 86400000;
  for (let cur = startMs; cur <= endMs; cur += CHUNK) {
    const from = new Date(cur).toISOString().slice(0, 10);
    const to = new Date(Math.min(cur + CHUNK - 86400000, endMs)).toISOString().slice(0, 10);
    const rows: B[] = (
      await fetch(RPC, {
        method: "POST",
        headers: H,
        body: JSON.stringify({ jsonrpc: "2.0", method: "getBookings", params: [{ date_from: from, date_to: to }], id: 1 }),
      }).then((r) => r.json())
    ).result ?? [];
    for (const b of rows) {
      if (!b.start_date || !b.event_id) continue;
      if (b.is_confirm === "0") continue;
      const startsAt = studioToISO(b.start_date);
      const key = `c-sb-${b.event_id}-${startsAt}`;
      const entry = truth.get(key) ?? { unitIds: new Set<string>(), unitNames: new Set<string>(), event: b.event };
      if (b.unit_id) entry.unitIds.add(String(b.unit_id));
      if (b.unit) entry.unitNames.add(b.unit);
      truth.set(key, entry);

      if (b.unit_id) {
        const u = sbUnitCounts.get(String(b.unit_id)) ?? { name: b.unit ?? "?", classes: new Set<string>() };
        u.classes.add(key);
        sbUnitCounts.set(String(b.unit_id), u);
      }
    }
  }
  console.log(`SimplyBook: ${truth.size} distinct classes\n`);

  // 2 — collisions: same service + time taught by two different coaches
  const collisions = Array.from(truth.entries()).filter(([, v]) => v.unitIds.size > 1);
  console.log(`ID COLLISIONS (same service+time, different coaches): ${collisions.length}`);
  for (const [k, v] of collisions.slice(0, 5)) {
    console.log(`   ${k.slice(0, 46)}…  coaches: ${Array.from(v.unitNames).join(" + ")}`);
  }
  if (collisions.length === 0) console.log("   none — one coach per class slot\n");
  else console.log("   ^ these merge into a single class in the app\n");

  // 3 — compare the app's assignment for each class
  await ensureDB();
  const db = getDB();
  const nameOf = (id: string) => db.instructors.find((i) => i.id === id)?.name ?? "(missing)";
  const unitOf = (id: string) => db.instructors.find((i) => i.id === id)?.simplybookUnitId;

  let checked = 0, ok = 0;
  const mismatches: string[] = [];
  const notInFeed: string[] = [];

  for (const cls of db.classes) {
    const t = truth.get(cls.id);
    if (!t) {
      notInFeed.push(cls.id);
      continue;
    }
    checked++;
    const appUnit = unitOf(cls.instructorId);
    const appName = nameOf(cls.instructorId);
    const matchesById = appUnit && t.unitIds.has(appUnit);
    const matchesByName = Array.from(t.unitNames).some(
      (n) => n.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") ===
             appName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    );
    if (matchesById || matchesByName) ok++;
    else
      mismatches.push(
        `   ${new Date(cls.startsAt).toISOString().slice(0, 16)}  ${cls.title.slice(0, 26).padEnd(26)} app: ${appName.padEnd(18)} SimplyBook: ${Array.from(t.unitNames).join("/")}`
      );
  }

  console.log(`ASSIGNMENT CHECK: ${ok}/${checked} correct` + (checked ? ` (${Math.round((ok / checked) * 100)}%)` : ""));
  if (mismatches.length) {
    console.log(`\nMISMATCHES (${mismatches.length}, showing 15):`);
    mismatches.slice(0, 15).forEach((m) => console.log(m));
  }
  console.log(`\nclasses in app but not in the checked window: ${notInFeed.length} (older history or timetable slots)`);

  // 4 — per-coach totals, side by side
  console.log("\nPER-COACH CLASS COUNTS (window only)");
  console.log("   coach                    app    SimplyBook");
  const appCounts = new Map<string, number>();
  for (const cls of db.classes) {
    if (!truth.has(cls.id)) continue;
    appCounts.set(cls.instructorId, (appCounts.get(cls.instructorId) ?? 0) + 1);
  }
  const rows: Array<[string, number, number]> = [];
  for (const [id, n] of Array.from(appCounts.entries())) {
    const unit = unitOf(id);
    const sb = unit ? sbUnitCounts.get(unit)?.classes.size ?? 0 : 0;
    rows.push([nameOf(id), n, sb]);
  }
  rows.sort((a, b) => b[1] - a[1]);
  for (const [name, appN, sbN] of rows) {
    const flag = appN === sbN ? "" : "   <-- differs";
    console.log(`   ${name.slice(0, 22).padEnd(24)} ${String(appN).padStart(4)}   ${String(sbN).padStart(6)}${flag}`);
  }
}

main();
