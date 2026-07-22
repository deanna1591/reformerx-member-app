/**
 * Studio time. SimplyBook returns wall-clock times in the studio's timezone
 * ("2026-07-23 07:15:00"), while the app may run on a server in UTC (Vercel).
 * Parsing those strings with the server's own timezone shifts every class by
 * the offset — 2 hours for Prague in summer. Everything here pins to the studio.
 */

export const STUDIO_TZ = process.env.STUDIO_TZ ?? "Europe/Prague";

/** Interpret a studio wall-clock string as an absolute time (UTC ISO). */
export function studioToISO(local: string): string {
  const s = local.trim().replace(" ", "T");
  const naive = new Date(`${s}${s.length === 16 ? ":00" : ""}Z`); // read as if UTC
  if (Number.isNaN(naive.getTime())) return new Date(local).toISOString();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(naive)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  const offset = asUTC - naive.getTime();
  return new Date(naive.getTime() - offset).toISOString();
}

/** "YYYY-MM-DD HH:mm:ss" in studio time — the format SimplyBook expects back. */
export function isoToStudioString(iso: string): string {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, x) => {
      if (x.type !== "literal") acc[x.type] = x.value;
      return acc;
    }, {});
  const hour = p.hour === "24" ? "00" : p.hour;
  return `${p.year}-${p.month}-${p.day} ${hour}:${p.minute}:${p.second}`;
}

/** Calendar day key ("2026-07-22") in studio time — never UTC. */
export function studioDayKey(d: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(d));
}

/** Day-strip label parts, in studio time. */
export function studioDayLabel(d: Date | string): { day: string; weekday: string } {
  const date = new Date(d);
  return {
    day: new Intl.DateTimeFormat("en-GB", { timeZone: STUDIO_TZ, day: "numeric" }).format(date),
    weekday: new Intl.DateTimeFormat("en-GB", { timeZone: STUDIO_TZ, weekday: "short" }).format(date),
  };
}

/** Long date, studio time: "Thursday, 23 July". */
export function studioLongDate(d: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: STUDIO_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(d));
}
