import Link from "next/link";
import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import { getDB, ensureDB } from "@/lib/store";
import { computeProgress, currentStreak, fmtDate, fmtTime, membershipActive, passUsage } from "@/lib/engine";
import { STUDIO_TZ } from "@/lib/time";
import CarriageProgress from "@/components/CarriageProgress";
import PromoCarousel from "@/components/PromoCarousel";
import { markNotificationsRead } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Home() {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");
  const db = getDB();
  const active = membershipActive(member);
  const pass = passUsage(member!.id);
  const nowMs = Date.now();
  const promos = (db.promotions ?? [])
    .filter(
      (p) =>
        p.active &&
        (!p.startsAt || new Date(p.startsAt).getTime() <= nowMs) &&
        (!p.endsAt || new Date(p.endsAt).getTime() >= nowMs)
    )
    .sort((a, b) => a.order - b.order);
  const in3Days = Date.now() + 3 * 86400000;
  const upcoming3 = db.bookings
    .filter((b) => b.memberId === member!.id)
    .map((b) => db.classes.find((c) => c.id === b.classId))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .filter((c) => {
      const t = new Date(c.startsAt).getTime();
      return t > Date.now() - 30 * 60000 && t < in3Days;
    })
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
    .map((cls) => ({ cls, coach: db.instructors.find((i) => i.id === cls.instructorId)?.name ?? "ReformerX" }));

  const now = Date.now();
  const nextBooking = db.bookings
    .filter((b) => b.memberId === member.id)
    .map((b) => db.classes.find((c) => c.id === b.classId)!)
    .filter((c) => c && new Date(c.startsAt).getTime() + c.durationMin * 60000 > now - 30 * 60000)
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))[0];
  const nextInstructor = nextBooking && db.instructors.find((i) => i.id === nextBooking.instructorId);
  const alreadyIn = nextBooking && db.checkIns.some((ci) => ci.memberId === member.id && ci.classId === nextBooking.id);
  const inWindow =
    nextBooking &&
    now >= new Date(nextBooking.startsAt).getTime() - 30 * 60000 &&
    now <= new Date(nextBooking.startsAt).getTime() + (nextBooking.durationMin + 30) * 60000;

  const myChallenges = db.challengeProgress
    .filter((p) => p.memberId === member.id && !p.completedAt)
    .map((p) => ({ p, ch: db.challenges.find((c) => c.id === p.challengeId)! }))
    .filter((x) => x.ch && x.ch.active)
    .map((x) => ({ ...x, value: computeProgress(member.id, x.ch) }))
    .sort((a, b) => b.value / b.ch.goal - a.value / a.ch.goal);

  const readyRewards = db.earnedRewards.filter((r) => r.memberId === member.id && r.status === "ready");
  const notifications = db.notifications.filter((n) => n.memberId === member.id).slice(0, 4);
  const unread = notifications.some((n) => !n.read);
  const streak = currentStreak(member.id);
  const firstName = member.name.split(" ")[0];

  return (
    <main className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="rise flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-tan-deep">ReformerX · Prague 1</p>
          <h1 className="mt-1 font-display text-[34px] leading-none">Hello, {firstName}</h1>
        </div>
        {streak > 0 && (
          <div className="mt-0.5 min-w-[46px] rounded-full bg-ink px-2 pb-2 pt-2.5 text-center text-chalk">
            <p className="font-display text-[20px] leading-none">{streak}</p>
            <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-sage">day<br />streak</p>
          </div>
        )}
      </header>

      {/* Reward ready — the happiest banner in the app */}
      {readyRewards.length > 0 && (
        <Link href="/rewards" className="rise rise-1 mt-4 block rounded-[16px] bg-sage p-3.5 text-ink transition active:scale-[0.99]">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-[17px] leading-none">{readyRewards[0].rewardEmoji}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-snug">
                {readyRewards.length === 1 ? `${readyRewards[0].reward} — ready!` : `${readyRewards.length} rewards ready!`}
              </p>
              <p className="text-[11.5px] text-ink/60">Waiting at reception</p>
            </div>
            <span aria-hidden className="text-[15px]">→</span>
          </div>
        </Link>
      )}

      {/* Next class — hero card */}
      <section className="rise rise-1 relative mt-5 overflow-hidden rounded-[150px_150px_22px_22px] bg-ink px-5 pb-5 pt-12 text-center text-white">
        <div aria-hidden className="pointer-events-none absolute inset-x-[10px] top-[10px] h-[190px] rounded-[140px_140px_0_0] border border-b-0 border-sage/35" />
        {nextBooking ? (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-sage">
              {fmtDate(nextBooking.startsAt)} · {fmtTime(nextBooking.startsAt)}
            </p>
            <p className="mt-2 font-display text-[30px] leading-[1.02]">{nextBooking.title}</p>
            <p className="mt-2 text-[12px] text-white/60">with {nextInstructor?.name}</p>
            <div className="mt-4">
              {alreadyIn ? (
                <span className="inline-block w-full rounded-full bg-white/10 py-3.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-sage">
                  Checked in ✓
                </span>
              ) : inWindow ? (
                <Link href="/checkin" className="block rounded-full bg-sage py-3.5 font-display text-[14px] tracking-[0.14em] text-ink transition active:scale-[0.98]">
                  Check in
                </Link>
              ) : (
                <>
                  <span className="block rounded-full bg-white/10 py-3.5 font-display text-[14px] tracking-[0.14em] text-white/50">Check in</span>
                  <p className="mt-2.5 text-[10px] text-white/40">Opens 30 minutes before class</p>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-sage">Next class</p>
            <p className="mt-3 font-display text-[26px] leading-tight">Nothing booked</p>
            <p className="mt-1 text-[13px] text-white/60">Reserve a class to keep the carriage moving.</p>
            <a
              href="https://www.reformerx.cz/booking/"
              target="_blank"
              className="mt-4 block rounded-full bg-sage py-3.5 font-display text-[14px] tracking-[0.14em] text-ink"
            >
              Book a class
            </a>
          </>
        )}
      </section>

      {/* Pass card — exact product, validity and usage */}
      <section className="rise rise-2 mt-3 rounded-xl2 border border-line bg-white px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${active ? "bg-spring-green" : "bg-spring-red"}`} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">{pass?.name ?? member.membershipType}</p>
              <p className="mt-0.5 text-[12px] text-smoke">
                {active
                  ? `${fmtDate(pass?.start ?? member.joinedAt)} → ${fmtDate(member.membershipExpires)}`
                  : `expired ${fmtDate(member.membershipExpires)}`}
              </p>
            </div>
          </div>
          <Link href="/store" className="shrink-0 text-[12px] font-semibold text-tan-deep">
            {active ? "Manage" : "Renew"}
          </Link>
        </div>

        {active && pass && (
          <div className="mt-3 border-t border-line pt-3">
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] font-medium">{pass.summary}</p>
              <p className="text-[12px] text-smoke">{pass.daysLeft} days left</p>
            </div>
            {(pass.credits || pass.totalDays) && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-chalk">
                <div
                  className="h-full rounded-full bg-sage"
                  style={{
                    width: `${Math.min(
                      100,
                      pass.credits
                        ? Math.round((pass.used / pass.credits) * 100)
                        : Math.round((((pass.daysUsed ?? 0) + 1) / (pass.totalDays ?? 1)) * 100)
                    )}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* Next 3 days */}
      {upcoming3.length > 0 && (
        <section className="rise rise-2 mt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[22px]">Next 3 days</h2>
            <Link href="/schedule" className="text-[13px] font-semibold text-tan-deep">
              Full schedule →
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {upcoming3.map(({ cls, coach }) => (
              <Link
                key={cls.id}
                href={`/class/${encodeURIComponent(cls.id)}`}
                className="flex items-center gap-3 rounded-xl2 bg-card p-4 shadow-card"
              >
                <div className="w-[70px] shrink-0">
                  <p className="font-display text-[15px] leading-none">
                    {new Date(cls.startsAt).toLocaleDateString("en-GB", { timeZone: STUDIO_TZ, weekday: "short" })}
                  </p>
                  <p className="mt-1 text-[13px] font-semibold tabular-nums">{fmtTime(cls.startsAt)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{cls.title}</p>
                  <p className="text-[12px] text-smoke">{coach}</p>
                </div>
                <span className="shrink-0 text-[12px] font-semibold text-tan-deep">Manage →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Challenges */}
      <section className="rise rise-3 mt-7">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[22px]">Your challenges</h2>
          <Link href="/challenges" className="text-[13px] font-semibold text-tan-deep">
            See all →
          </Link>
        </div>
        {myChallenges.length === 0 ? (
          <div className="mt-3 rounded-xl2 border border-dashed border-line bg-white p-5 text-center">
            <p className="text-[14px] text-smoke">No active challenges — pick one and put a reward on the table.</p>
            <Link href="/challenges" className="mt-2 inline-block text-[14px] font-semibold text-tan-deep">
              Browse challenges →
            </Link>
          </div>
        ) : (
          <div className="-mx-5 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {myChallenges.map(({ ch, value }) => (
              <Link
                key={ch.id}
                href={`/challenges/${ch.id}`}
                className="w-[82%] shrink-0 snap-start rounded-[20px] border border-line bg-card p-4 transition active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-tan-deep">{ch.emoji} challenge</p>
                    <p className="mt-0.5 truncate font-display text-[19px]">{ch.name}</p>
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="font-display text-[32px] leading-none">{value}</span>
                    <span className="font-display text-[16px] text-smoke">/{ch.goal}</span>
                  </p>
                </div>
                <div className="mt-3">
                  <CarriageProgress value={value} goal={ch.goal} color={ch.springColor} />
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl bg-chalk px-3 py-2">
                  <span className="min-w-0 truncate text-[11.5px] font-semibold">{ch.rewardEmoji ?? "🎁"} {ch.reward}</span>
                  <span className="shrink-0 text-[11px] font-semibold text-tan-deep">{Math.max(0, ch.goal - value)} to go</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Updates */}
      {promos.length > 0 && (
        <section className="rise rise-3 mt-8">
          <h2 className="font-display text-[22px]">What&apos;s on</h2>
          <div className="mt-3">
            <PromoCarousel promos={promos} />
          </div>
        </section>
      )}

      {/* Updates */}
      {notifications.length > 0 && (
        <section className="mt-7 pb-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[22px]">
              Updates {unread && <span className="ml-1 inline-block h-2 w-2 rounded-full bg-rose align-middle" />}
            </h2>
            {unread && (
              <form action={markNotificationsRead}>
                <button className="text-[13px] font-semibold text-tan-deep">Mark read</button>
              </form>
            )}
          </div>
          <ul className="mt-3 divide-y divide-line rounded-xl2 border border-line bg-white">
            {notifications.map((n) => (
              <li key={n.id} className={`px-4 py-3 text-[14px] leading-relaxed ${n.read ? "text-smoke" : ""}`}>
                {n.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
