import Link from "next/link";
import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import { getDB, ensureDB } from "@/lib/store";
import { fmtTime, membershipActive, classIsFull, waitlistPosition, canBook } from "@/lib/engine";
import { inAppBookingEnabled, simplybookBookingUrl } from "@/lib/simplybook";
import { studioDayKey, studioDayLabel } from "@/lib/time";
import { getT } from "@/lib/i18n";
import { reserveClass } from "@/app/actions";

export const dynamic = "force-dynamic";

const dayKey = studioDayKey;

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { d?: string; type?: string; coach?: string };
}) {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");
  const db = getDB();
  const active = membershipActive(member);
  const canBookInApp = inAppBookingEnabled();
  const t = getT();
  const eligibility = canBook(member.id);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });
  const selected = searchParams.d && days.some((d) => dayKey(d) === searchParams.d) ? searchParams.d : dayKey(today);
  const type = searchParams.type ?? "all";
  const coach = searchParams.coach ?? "all";

  const upcomingAll = db.classes.filter((c) => new Date(c.startsAt).getTime() > Date.now() - 30 * 60000);
  const types = Array.from(new Set(upcomingAll.map((c) => c.title))).sort();
  const coaches = Array.from(
    new Set(upcomingAll.map((c) => db.instructors.find((i) => i.id === c.instructorId)?.name).filter(Boolean))
  ).sort() as string[];

  let list = upcomingAll.filter((c) => dayKey(c.startsAt) === selected);
  if (type !== "all") list = list.filter((c) => c.title === type);
  if (coach !== "all") list = list.filter((c) => db.instructors.find((i) => i.id === c.instructorId)?.name === coach);
  list = list.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));

  const myBookings = new Set(db.bookings.filter((b) => b.memberId === member.id).map((b) => b.classId));

  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams({ d: selected, ...(type !== "all" ? { type } : {}), ...(coach !== "all" ? { coach } : {}), ...over });
    for (const [k, v] of Array.from(p.entries())) if (v === "all") p.delete(k);
    return `/schedule?${p.toString()}`;
  };

  return (
    <div className="pb-28">
      <header className="rounded-b-[26px] bg-ink px-5 pb-5 pt-[max(1.2rem,env(safe-area-inset-top))] text-white">
        <h1 className="font-display text-[28px] uppercase tracking-wide">{t("schedule.title")}</h1>
        <p className="mt-0.5 text-[13px] text-white/60">
          {active
            ? eligibility.creditsLeft != null
              ? `${member.membershipType} · ${t("schedule.creditsLeft", { n: eligibility.creditsLeft })}`
              : t("schedule.subtitleActive", { pass: member.membershipType })
            : t("schedule.subtitleInactive")}
        </p>

        <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
          {days.map((d) => {
            const k = dayKey(d);
            const on = k === selected;
            return (
              <Link
                key={k}
                href={href({ d: k })}
                className={`flex min-w-[52px] flex-col items-center rounded-2xl px-2 py-2.5 transition ${
                  on ? "bg-white text-ink" : "bg-white/10 text-white/75"
                }`}
              >
                <span className="font-display text-[20px] leading-none">{studioDayLabel(d).day}</span>
                <span className="mt-1 text-[10px] uppercase tracking-wider">{studioDayLabel(d).weekday}</span>
              </Link>
            );
          })}
        </div>
      </header>

      {/* Filters */}
      <div className="flex gap-2 px-5 pt-4">
        <form action="/schedule" method="GET" className="flex flex-1 gap-2">
          <input type="hidden" name="d" value={selected} />
          <select name="type" defaultValue={type} className="flex-1 rounded-xl border border-line bg-white px-3 py-2 text-[13px] font-semibold">
            <option value="all">{t("schedule.allClasses")}</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select name="coach" defaultValue={coach} className="flex-1 rounded-xl border border-line bg-white px-3 py-2 text-[13px] font-semibold">
            <option value="all">{t("schedule.allCoaches")}</option>
            {coaches.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button className="rounded-xl bg-ink px-3 py-2 text-[13px] font-semibold text-white">{t("schedule.filter")}</button>
        </form>
      </div>

      <div className="mt-3 space-y-2 px-5">
        {list.map((c) => {
          const coach = db.instructors.find((i) => i.id === c.instructorId);
          const coachName = coach?.name ?? "ReformerX";
          const booked = myBookings.has(c.id);
          return (
            <div key={c.id} className="flex items-center gap-3 rounded-xl2 bg-card p-4 shadow-card">
              <Link href={`/class/${encodeURIComponent(c.id)}`} className="flex min-w-0 flex-1 items-center gap-3">
              <div className="w-[62px] shrink-0">
                <p className="font-display text-[17px] leading-none">{fmtTime(c.startsAt)}</p>
                <p className="mt-1 text-[11px] text-smoke">{c.durationMin} {t("common.min")}</p>
              </div>
              {coach?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coach.photoUrl} alt={coachName} className="h-10 w-10 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sage-soft font-display text-[15px]">
                  {coachName[0]}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.title}</p>
                <p className="text-[12px] text-smoke">
                  {coachName}
                  {typeof c.spotsLeft === "number" && c.spotsLeft > 0 && c.spotsLeft <= 3 && (
                    <span className="ml-1.5 font-medium text-tan-deep">· {t("schedule.spotsLeft", { n: c.spotsLeft })}</span>
                  )}
                </p>
              </div>
              </Link>
              {booked ? (
                <Link
                  href={`/class/${encodeURIComponent(c.id)}`}
                  className="rounded-full border border-sage-deep/40 bg-sage-soft px-3.5 py-2 text-[12px] font-semibold text-sage-deep"
                >
                  {t("schedule.booked")} ✓
                </Link>
              ) : waitlistPosition(member.id, c.id) ? (
                <Link
                  href={`/class/${encodeURIComponent(c.id)}`}
                  className="rounded-full border border-line bg-white px-3.5 py-2 text-[12px] font-semibold text-smoke"
                >
                  {t("schedule.waitlistPos", { n: waitlistPosition(member.id, c.id)! })}
                </Link>
              ) : classIsFull(c.id) ? (
                <Link
                  href={`/class/${encodeURIComponent(c.id)}`}
                  className="rounded-full bg-ink px-3.5 py-2 text-[12px] font-semibold text-white"
                >
                  {t("schedule.full")}
                </Link>
              ) : !eligibility.ok ? (
                <Link href="/store" className="rounded-full bg-ink px-3.5 py-2 text-[12px] font-semibold text-white">
                  {eligibility.reason === "no_credits" ? t("schedule.topUp") : t("schedule.getPass")}
                </Link>
              ) : canBookInApp ? (
                <form action={reserveClass}>
                  <input type="hidden" name="classId" value={c.id} />
                  <button className="rounded-full bg-sage px-3.5 py-2 text-[12px] font-semibold text-ink transition active:scale-95">
                    {t("schedule.reserve")}
                  </button>
                </form>
              ) : (
                <a
                  href={simplybookBookingUrl(c.serviceId, c.startsAt)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-sage px-3.5 py-2 text-[12px] font-semibold text-ink"
                >
                  {t("schedule.reserve")} ↗
                </a>
              )}
            </div>
          );
        })}

        {list.length === 0 && (
          <div className="rounded-xl2 bg-card p-8 text-center shadow-card">
            <p className="font-display text-[20px]">{t("schedule.empty")}</p>
            <p className="mt-1 text-[13px] text-smoke">
              {t("schedule.emptyHint")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
