import Link from "next/link";
import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import { getDB } from "@/lib/store";
import { computeProgress, currentStreak, fmtDate, fmtTime, membershipActive } from "@/lib/engine";
import CarriageProgress from "@/components/CarriageProgress";
import { markNotificationsRead } from "@/app/actions";

export const dynamic = "force-dynamic";

export default function Home() {
  const member = currentMember();
  if (!member) redirect("/login");
  const db = getDB();
  const active = membershipActive(member);

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
          <span className="mt-1 rounded-full border border-line bg-white px-3 py-1.5 text-[13px] font-semibold">
            🔥 {streak}-day streak
          </span>
        )}
      </header>

      {/* Reward ready — the happiest banner in the app */}
      {readyRewards.length > 0 && (
        <Link href="/rewards" className="rise rise-1 mt-5 block rounded-xl2 bg-sage p-4 text-ink transition active:scale-[0.99]">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/60 text-2xl">{readyRewards[0].rewardEmoji}</span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-snug">
                {readyRewards.length === 1 ? `${readyRewards[0].reward} is ready!` : `${readyRewards.length} rewards ready!`}
              </p>
              <p className="text-[13px] text-ink/70">Pick up at reception on your next visit →</p>
            </div>
          </div>
        </Link>
      )}

      {/* Next class — hero card */}
      <section className="rise rise-1 mt-5 overflow-hidden rounded-xl2 bg-ink p-5 text-white">
        {nextBooking ? (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sage">Next class</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo-white.png" alt="" className="h-3.5 w-auto opacity-70" />
            </div>
            <p className="mt-3 font-display text-[30px] leading-none">{nextBooking.title}</p>
            <p className="mt-2 text-[14px] text-white/70">
              {fmtDate(nextBooking.startsAt)} · {fmtTime(nextBooking.startsAt)} · with {nextInstructor?.name}
            </p>
            <div className="mt-5">
              {alreadyIn ? (
                <span className="inline-block rounded-xl bg-white/10 px-4 py-3 text-[14px] font-semibold text-sage">
                  Checked in — enjoy the class ✓
                </span>
              ) : inWindow ? (
                <Link href="/checkin" className="block rounded-xl bg-sage py-3.5 text-center text-[15px] font-semibold text-ink transition active:scale-[0.98]">
                  Check in now
                </Link>
              ) : (
                <p className="rounded-xl bg-white/10 px-4 py-3 text-[13px] text-white/70">
                  Check-in opens 30 minutes before class.
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sage">Next class</p>
            <p className="mt-3 font-display text-[26px] leading-tight">Nothing booked yet</p>
            <p className="mt-1 text-[14px] text-white/70">Reserve a class to keep the carriage moving.</p>
            <a
              href="https://www.reformerx.cz/booking/"
              target="_blank"
              className="mt-5 block rounded-xl bg-sage py-3.5 text-center text-[15px] font-semibold text-ink"
            >
              Book a class
            </a>
          </>
        )}
      </section>

      {/* Membership line */}
      <section className="rise rise-2 mt-3 flex items-center justify-between rounded-xl2 border border-line bg-white px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className={`h-2 w-2 rounded-full ${active ? "bg-spring-green" : "bg-spring-red"}`} />
          <p className="text-[14px] font-medium">{member.membershipType}</p>
        </div>
        <p className="text-[13px] text-smoke">
          {active ? `until ${fmtDate(member.membershipExpires)}` : `expired ${fmtDate(member.membershipExpires)}`}
        </p>
      </section>

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
                className="w-[80%] shrink-0 snap-start rounded-xl2 border border-line bg-white p-4 transition active:scale-[0.99]"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[15px] font-semibold">
                    {ch.emoji} {ch.name}
                  </p>
                  <p className="text-[13px] font-semibold tabular-nums text-smoke">
                    {value}/{ch.goal}
                  </p>
                </div>
                <div className="mt-3">
                  <CarriageProgress value={value} goal={ch.goal} color={ch.springColor} />
                </div>
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-sage-soft px-2.5 py-1 text-[12px] font-medium">
                  {ch.rewardEmoji ?? "🎁"} {ch.reward}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

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
