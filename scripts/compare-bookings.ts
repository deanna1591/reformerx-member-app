/* Exactly which classes SimplyBook has for a client vs what the app stored.
   Usage: npx tsx scripts/compare-bookings.ts 303 */
import { readFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].split("#")[0].trim().replace(/^["']|["']$/g, "");
}

const CLIENT = process.argv[2];
if (!CLIENT) {
  console.log("usage: npx tsx scripts/compare-bookings.ts <simplybook client id>");
  process.exit(1);
}

const REST = "https://user-api-v2.simplybook.it";

async function main() {
  const { ensureDB, getDB } = await import("../src/lib/store");
  const { studioDayKey } = await import("../src/lib/time");

  const auth = await fetch(`${REST}/admin/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company: process.env.SIMPLYBOOK_COMPANY,
      login: process.env.SIMPLYBOOK_LOGIN,
      password: process.env.SIMPLYBOOK_USER_KEY,
    }),
  }).then((r) => r.json());
  if (!auth.token) {
    console.log("AUTH FAILED", auth);
    return;
  }
  const H = {
    "Content-Type": "application/json",
    "X-Company-Login": process.env.SIMPLYBOOK_COMPANY as string,
    "X-Token": auth.token,
  };

  // 1 — everything SimplyBook has for this client
  type Row = { id?: number | string; start_datetime?: string; status?: string; service?: { name?: string } };
  const rows: Row[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${REST}/admin/bookings?filter[client_id]=${CLIENT}&on_page=100&page=${page}`, { headers: H });
    const body = await res.json().catch(() => null);
    const batch: Row[] = Array.isArray(body) ? body : body?.data ?? [];
    rows.push(...batch);
    const pages = body?.metadata?.pages_count ?? 1;
    if (page >= pages || batch.length === 0) break;
  }

  const now = Date.now();
  const confirmed = rows.filter((r) => (r.status ?? "").toLowerCase() === "confirmed");
  const past = confirmed.filter((r) => r.start_datetime && new Date(r.start_datetime.replace(" ", "T")).getTime() < now);
  const future = confirmed.filter((r) => r.start_datetime && new Date(r.start_datetime.replace(" ", "T")).getTime() >= now);

  console.log(`SimplyBook client ${CLIENT}:`);
  console.log(`  ${rows.length} bookings total, ${confirmed.length} confirmed`);
  console.log(`  confirmed past: ${past.length}   confirmed upcoming: ${future.length}`);
  const oldest = past.map((r) => r.start_datetime!).sort()[0];
  console.log(`  oldest confirmed class: ${oldest ?? "—"}`);

  // 2 — what the app stored
  await ensureDB();
  const db = getDB();
  const member = db.members.find((m) => m.simplybookId === CLIENT);
  if (!member) {
    console.log(`\napp: no member with simplybookId ${CLIENT}`);
    return;
  }
  const stored = db.bookings
    .filter((b) => b.memberId === member.id)
    .map((b) => db.classes.find((c) => c.id === b.classId))
    .filter(Boolean) as Array<{ startsAt: string; title: string }>;
  const storedPast = stored.filter((c) => new Date(c.startsAt).getTime() < now);

  console.log(`\napp store: ${stored.length} bookings (${storedPast.length} past)`);

  // 3 — the diff, by studio day + time
  const key = (iso: string) => `${studioDayKey(iso)} ${new Date(iso).toISOString().slice(11, 16)}`;
  const storedKeys = new Set(stored.map((c) => studioDayKey(c.startsAt)));
  const missing = past
    .map((r) => r.start_datetime!)
    .filter((d) => !storedKeys.has(d.slice(0, 10)))
    .sort();

  console.log(`\nconfirmed past classes SimplyBook has but the app does NOT (${missing.length}):`);
  for (const d of missing.slice(0, 30)) console.log("  ", d);
  if (missing.length === 0) console.log("   none — the app has them all");

  console.log(`\nsample of stored past classes (${Math.min(5, storedPast.length)}):`);
  for (const c of storedPast.slice(-5)) console.log("  ", key(c.startsAt), c.title);
}

main();
