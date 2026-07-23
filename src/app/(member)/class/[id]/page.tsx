import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import { getDB, ensureDB } from "@/lib/store";
import { fmtTime, membershipActive, classIsFull, waitlistFor, waitlistPosition, memberWaitlistEntry, canBook } from "@/lib/engine";
import { inAppBookingEnabled, simplybookBookingUrl } from "@/lib/simplybook";
import { studioLongDate, STUDIO_TZ } from "@/lib/time";
import { getT } from "@/lib/i18n";
import { reserveClass, cancelReservation, rescheduleClass, joinWaitlist, leaveWaitlist, confirmWaitlistOffer, declineWaitlistOffer } from "@/app/actions";
import ConfirmButton from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

export default async function ClassDetail({ params }: { params: { id: string } }) {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");
  const db = getDB();
  const cls = db.classes.find((c) => c.id === decodeURIComponent(params.id));
  if (!cls) notFound();

  const coach = db.instructors.find((i) => i.id === cls.instructorId);
  const start = new Date(cls.startsAt);
  const active = membershipActive(member);
  const canBookInApp = inAppBookingEnabled();
  const booked = db.bookings.some((b) => b.memberId === member.id && b.classId === cls.id);
  const isPast = start.getTime() < Date.now();
  const checkedIn = db.checkIns.some((ci) => ci.memberId === member.id && ci.classId === cls.id);
  const isFull = classIsFull(cls.id);
  const queue = waitlistFor(cls.id);
  const myEntry = memberWaitlistEntry(member.id, cls.id);
  const myPosition = waitlistPosition(member.id, cls.id);
  const offerLive =
    myEntry?.status === "offered" &&
    (!myEntry.offerExpiresAt || new Date(myEntry.offerExpiresAt).getTime() > Date.now());

  const t = getT();
  const eligibility = canBook(member.id, cls.id);
  const dateLabel = studioLongDate(start);
  const endsAt = new Date(start.getTime() + cls.durationMin * 60000);

  // Same class type, next 14 days — options to move to
  const alternatives = db.classes
    .filter(
      (c) =>
        c.id !== cls.id &&
        c.title === cls.title &&
        new Date(c.startsAt).getTime() > Date.now() &&
        new Date(c.startsAt).getTime() < Date.now() + 14 * 86400000 &&
        !db.bookings.some((b) => b.memberId === member.id && b.classId === c.id)
    )
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
    .slice(0, 6);

  const gcalUrl = (() => {
    const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const p = new URLSearchParams({
      action: "TEMPLATE",
      text: `${cls.title} · ReformerX`,
      dates: `${f(start)}/${f(endsAt)}`,
      details: `${cls.durationMin} min with ${coach?.name ?? "ReformerX"}`,
      location: "ReformerX, Haštalská, Prague 1",
    });
    return `https://calendar.google.com/calendar/render?${p.toString()}`;
  })();

  return (
    <div className="pb-28">
      <header className="rounded-b-[26px] bg-ink px-5 pb-6 pt-[max(1.2rem,env(safe-area-inset-top))] text-white">
        <Link href="/schedule" className="text-[13px] text-white/60">← {t("schedule.title")}</Link>
        <p className="mt-3 text-[12px] uppercase tracking-[0.18em] text-white/55">{dateLabel}</p>
        <h1 className="mt-1 font-display text-[30px] uppercase leading-tight tracking-wide">{cls.title}</h1>
        <p className="mt-1.5 text-[14px] text-white/70">
          {fmtTime(cls.startsAt)}–{fmtTime(endsAt.toISOString())} · {cls.durationMin} {t("common.min")}
          {typeof cls.spotsLeft === "number" && !isPast && (
            <> · {isFull ? t("class.full") : cls.spotsLeft === 1 ? t("class.oneSpotLeft") : t("class.spotsLeft", { n: cls.spotsLeft! })}</>
          )}
        </p>

        {booked && (
          <span className="mt-3 inline-block rounded-full bg-sage px-3 py-1.5 text-[12px] font-semibold text-ink">
            {checkedIn ? `${t("class.checkedIn")} ✓` : `${t("class.youreBooked")} ✓`}
          </span>
        )}
      </header>

      <div className="space-y-4 px-5 pt-5">
        <section className="rounded-xl2 bg-card p-5 shadow-card">
          <div className="flex items-center gap-3">
            {coach?.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coach.photoUrl} alt={coach.name} className="h-14 w-14 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-sage-soft font-display text-[20px]">
                {(coach?.name ?? "R")[0]}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-semibold">{coach?.name ?? "ReformerX"}</p>
              <p className="text-[12px] text-smoke">{coach?.role ?? "Instructor"}</p>
            </div>
          </div>
          {coach?.bio && <p className="mt-3 text-[13px] leading-relaxed text-smoke">{coach.bio}</p>}
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[13px]">
            <div>
              <p className="text-smoke">{t("class.studio")}</p>
              <p className="mt-0.5 font-medium">Haštalská, Prague 1</p>
            </div>
            <div>
              <p className="text-smoke">{t("class.yourPass")}</p>
              <p className="mt-0.5 font-medium">{active ? member.membershipType : t("pass.none")}</p>
            </div>
          </div>
        </section>

        {/* Waitlist offer — needs confirming, never auto-books */}
        {offerLive && !isPast && (
          <section className="rounded-xl2 bg-ink p-5 text-white shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sage">{t("wait.spotOpened")}</p>
            <p className="mt-2 text-[14px] leading-relaxed text-white/85">
              {t("wait.offerBody", {
                until: myEntry?.offerExpiresAt ? t("wait.until", { time: fmtTime(myEntry.offerExpiresAt) }) : "",
              })}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <form action={confirmWaitlistOffer}>
                <input type="hidden" name="classId" value={cls.id} />
                <button className="w-full rounded-xl bg-sage py-3 text-[14px] font-semibold text-ink">
                  {t("wait.confirmSpot")}
                </button>
              </form>
              <form action={declineWaitlistOffer}>
                <input type="hidden" name="classId" value={cls.id} />
                <button className="w-full rounded-xl border border-white/25 py-3 text-[14px] font-semibold text-white/80">
                  {t("wait.noThanks")}
                </button>
              </form>
            </div>
          </section>
        )}

        {/* Primary actions */}
        {!isPast && (
          <section className="space-y-2">
            {booked ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={`/api/calendar/${encodeURIComponent(cls.id)}`}
                    className="rounded-xl2 bg-ink py-3.5 text-center text-[14px] font-semibold text-white"
                  >
                    {t("class.addCalendar")}
                  </a>
                  <a
                    href={gcalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl2 border border-line bg-white py-3.5 text-center text-[14px] font-semibold"
                  >
                    {t("class.googleCalendar")}
                  </a>
                </div>
                <form action={cancelReservation}>
                  <input type="hidden" name="classId" value={cls.id} />
                  <ConfirmButton
                    message={t("class.cancelConfirm", { title: cls.title, date: dateLabel })}
                    className="w-full rounded-xl2 bg-white py-3.5 text-[14px] font-semibold text-spring-red shadow-card"
                  >
                    {t("class.cancelBooking")}
                  </ConfirmButton>
                </form>
              </>
            ) : eligibility.reason === "daily_limit" ? (
              <div className="rounded-xl2 bg-card p-5 text-center shadow-card">
                <p className="font-display text-[18px]">{t("class.dailyLimitTitle")}</p>
                <p className="mt-1 text-[13px] text-smoke">{t("class.dailyLimitBody")}</p>
                <Link href="/schedule" className="mt-3 inline-block text-[13px] font-semibold text-tan-deep">
                  {t("home.fullSchedule")} →
                </Link>
              </div>
            ) : eligibility.reason === "no_credits" ? (
              <div className="rounded-xl2 bg-card p-5 text-center shadow-card">
                <p className="font-display text-[18px]">{t("class.noCreditsTitle")}</p>
                <p className="mt-1 text-[13px] text-smoke">{t("class.noCreditsBody")}</p>
                <Link href="/store" className="mt-3 inline-block rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-white">
                  {t("class.topUp")}
                </Link>
              </div>
            ) : !active ? (
              <Link href="/store" className="block rounded-xl2 bg-ink py-4 text-center text-[15px] font-semibold text-white">
                {t("class.getPassToBook")}
              </Link>
            ) : isFull && !offerLive ? (
              myEntry ? (
                <div className="rounded-xl2 bg-card p-5 text-center shadow-card">
                  <p className="font-display text-[18px]">{t("wait.youreOn")}</p>
                  <p className="mt-1 text-[13px] text-smoke">
                    {t("wait.position", { pos: myPosition!, total: queue.length })}
                  </p>
                  <form action={leaveWaitlist} className="mt-3">
                    <input type="hidden" name="classId" value={cls.id} />
                    <button className="text-[13px] font-semibold text-spring-red">{t("wait.leave")}</button>
                  </form>
                </div>
              ) : (
                <form action={joinWaitlist}>
                  <input type="hidden" name="classId" value={cls.id} />
                  <button className="w-full rounded-xl2 bg-ink py-4 text-[15px] font-semibold text-white">
                    {t("wait.joinFull")}
                    {queue.length > 0 && <span className="ml-1 font-normal text-white/60">{t("wait.waitingCount", { n: queue.length })}</span>}
                  </button>
                </form>
              )
            ) : canBookInApp ? (
              <form action={reserveClass}>
                <input type="hidden" name="classId" value={cls.id} />
                <button className="w-full rounded-xl2 bg-sage py-4 text-[15px] font-semibold text-ink transition active:scale-[0.99]">
                  {t("class.reserveThis")}
                </button>
              </form>
            ) : (
              <a
                href={simplybookBookingUrl(cls.serviceId, cls.startsAt)}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl2 bg-sage py-4 text-center text-[15px] font-semibold text-ink"
              >
                {t("class.reserveExternal")} ↗
              </a>
            )}
          </section>
        )}

        {/* Reschedule */}
        {booked && !isPast && alternatives.length > 0 && (
          <section className="rounded-xl2 bg-card p-5 shadow-card">
            <h2 className="font-display text-[19px]">{t("class.moveTitle")}</h2>
            <p className="mt-1 text-[12px] text-smoke">
              {t("class.moveHint")}
            </p>
            <div className="mt-3 space-y-2">
              {alternatives.map((alt) => {
                const altCoach = db.instructors.find((i) => i.id === alt.instructorId)?.name;
                const d = new Date(alt.startsAt);
                return (
                  <form key={alt.id} action={rescheduleClass} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
                    <input type="hidden" name="fromClassId" value={cls.id} />
                    <input type="hidden" name="toClassId" value={alt.id} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold">
                        {d.toLocaleDateString("en-GB", { timeZone: STUDIO_TZ, weekday: "short", day: "numeric", month: "short" })} · {fmtTime(alt.startsAt)}
                      </p>
                      <p className="text-[12px] text-smoke">{altCoach ?? "ReformerX"}</p>
                    </div>
                    <ConfirmButton
                      message={t("class.moveConfirm", { when: d.toLocaleString("en-GB", { timeZone: STUDIO_TZ }) })}
                      className="rounded-full bg-ink px-3.5 py-2 text-[12px] font-semibold text-white"
                    >
                      {t("class.moveHere")}
                    </ConfirmButton>
                  </form>
                );
              })}
            </div>
          </section>
        )}

        {isPast && (
          <section className="rounded-xl2 bg-card p-5 text-center shadow-card">
            <p className="font-display text-[18px]">{checkedIn ? `${t("class.youMadeIt")} 🎉` : t("class.finished")}</p>
            <p className="mt-1 text-[13px] text-smoke">
              {checkedIn ? t("class.countedTowards") : t("class.bookNext")}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
