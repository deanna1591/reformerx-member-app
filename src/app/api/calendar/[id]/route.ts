import { NextRequest } from "next/server";
import { getDB, ensureDB } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Download a class as a calendar event (.ics) — works with Apple, Google, Outlook. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureDB();
  const db = getDB();
  const cls = db.classes.find((c) => c.id === params.id);
  if (!cls) return new Response("Not found", { status: 404 });

  const coach = db.instructors.find((i) => i.id === cls.instructorId)?.name ?? "ReformerX";
  const start = new Date(cls.startsAt);
  const end = new Date(start.getTime() + cls.durationMin * 60000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ReformerX//Member App//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${cls.id}@reformerx.cz`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`${cls.title} · ReformerX`)}`,
    `DESCRIPTION:${esc(`${cls.durationMin} min with ${coach}. Check in with your QR code at the studio.`)}`,
    "LOCATION:ReformerX, Haštalská, Prague 1",
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    "DESCRIPTION:ReformerX class in 2 hours",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="reformerx-${start.toISOString().slice(0, 10)}.ics"`,
    },
  });
}
