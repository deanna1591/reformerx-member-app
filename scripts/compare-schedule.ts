/* Day-by-day comparison of the app's schedule vs SimplyBook's real timetable.
   Read-only. Run:  npx tsx scripts/compare-schedule.ts [days]   (default 7) */
import { readFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].split("#")[0].trim().replace(/^["']|["']$/g, "");
}

const DAYS = Number(process.argv[2] ?? 7);
const V2 = "https://user-api-v2.simplybook.it";

async function main() {
  const { ensureDB, getDB } = await import("../src/lib/store");
  const { studioToISO, studioDayKey } = await import("../src/lib/time");

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
  };

  const sbGet = async <T,>(path: string): Promise<T> => {
    const r = await fetch(`${V2}${path}`, { headers: H });
    const t = await r.text();
    if (!r.ok) throw new Error(`${r.status} ${path}`);
    return (t ? JSON.parse(t) : []) as T;
  };
  const all = async <T,>(path: string): Promise<T[]> => {
    const b = await sbGet<{ data?: T[] } | T[]>(`${path}${path.includes("?") ? "&" : "?"}on_page=100`);
    return Array.isArray(b) ? b : b?.data ?? [];
  };

  const services = await all<{ id: number; name: string; providers?: number[]; is_active?: boolean; duration?: number }>("/admin/services");
  const providers = await all<{ id: number; name: string }>("/admin/providers");
  const pname = (id?: number) => providers.find((p) => Number(p.id) === Number(id))?.name ?? "?";

  const from = studioDayKey(new Date());
  const to = studioDayKey(new Date(Date.now() + DAYS * 86400000));

  // SimplyBook truth, both ways: with and without the restriction flag
  const build = async (skip: "0" | "1") => {
    const map = new Map<string, { title: string; coach: string }>();
    for (const svc of services.filter((s) => s.is_active !== false)) {
      for (const pid of (svc.providers ?? []).length ? svc.providers! : [undefined]) {
        const q = new URLSearchParams({
          service_id: String(svc.id), date_from: from, date_to: to,
          count: "1", skip_min_max_restriction: skip, with_available_slots: "1",
        });
        if (pid) q.set("provider_id", String(pid));
        let days: Array<{ date?: string; slots?: Array<{ time?: string }> }> = [];
        try { days = await sbGet(`/admin/timeline/slots?${q}`); } catch { continue; }
        for (const d of days ?? []) {
          for (const sl of d.slots ?? []) {
            if (!d.date || !sl.time) continue;
            const time = sl.time.length === 5 ? `${sl.time}:00` : sl.time;
            map.set(studioToISO(`${d.date} ${time}`) + `|${svc.id}`, { title: svc.name, coach: pname(pid) });
          }
        }
      }
    }
    return map;
  };

  const strict = await build("0");
  const loose = await build("1");
  console.log(`SimplyBook slots over ${DAYS} days — correct flag (skip=0): ${strict.size} | wrong flag (skip=1): ${loose.size}`);
  console.log(loose.size > strict.size
    ? `→ skip=1 invents ${loose.size - strict.size} extra slots. skip=0 is the real timetable.\n`
    : "→ both agree.\n");

  await ensureDB();
  const db = getDB();
  const coachOf = (id: string) => db.instructors.find((i) => i.id === id)?.name ?? "?";

  for (let i = 0; i < DAYS; i++) {
    const day = studioDayKey(new Date(Date.now() + i * 86400000));
    const sbRows = Array.from(strict.entries())
      .filter(([k]) => studioDayKey(k.split("|")[0]) === day)
      .map(([k, v]) => ({ at: k.split("|")[0], ...v }))
      .sort((a, b) => a.at.localeCompare(b.at));
    const appRows = db.classes
      .filter((c) => studioDayKey(c.startsAt) === day)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

    const fmt = (iso: string) =>
      new Intl.DateTimeFormat("en-GB", { timeZone: process.env.STUDIO_TZ ?? "Europe/Prague", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

    console.log(`\n=== ${day} — SimplyBook ${sbRows.length} | app ${appRows.length} ===`);
    const sbKeys = new Set(sbRows.map((r) => `${fmt(r.at)} ${r.title}`));
    const appKeys = new Set(appRows.map((c) => `${fmt(c.startsAt)} ${c.title}`));

    for (const r of sbRows) {
      const k = `${fmt(r.at)} ${r.title}`;
      console.log(`  ${appKeys.has(k) ? "ok  " : "MISS"} ${fmt(r.at)}  ${r.title.slice(0, 26).padEnd(26)} ${r.coach}`);
    }
    for (const c of appRows) {
      const k = `${fmt(c.startsAt)} ${c.title}`;
      if (!sbKeys.has(k)) console.log(`  EXTRA ${fmt(c.startsAt)}  ${c.title.slice(0, 26).padEnd(26)} ${coachOf(c.instructorId)}  <- not in SimplyBook`);
    }
  }
  console.log("\nMISS = SimplyBook has it, app doesn't. EXTRA = app shows a class SimplyBook doesn't list.");
}

main();
