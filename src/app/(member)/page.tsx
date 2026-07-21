import Link from "next/link";
import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import { getDB } from "@/lib/store";
import { computeProgress, currentStreak, fmtDate, fmtTime, membershipActive, memberStats } from "@/lib/engine";
import CarriageProgress from "@/components/CarriageProgress";
import { markNotificationsRead } from "@/app/actions";

export const dynamic = "force-dynamic";

export default function Home() {
  const member = currentMember();
  if (!member) redirect("/login");
  const db = getDB();
  const active = membershipActive(member);
  const stats = memberStats(member.id);

  const now = Date.now();
  const nextBooking = db.bookings
    .filter((b) => b.memberId === member.id)
    .map((b) => db.classes.find((c) => c.id === b.classId)!)
    .filter((c) => c && new Date(c.startsAt).getTime() + c.durationMin * 60000 > now - 30 * 60000)
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))[0];
  const nextInstructor = nextBooking && db.instructors.find((i) => i.id === nextBooking.instructorId);
  const alreadyIn = nextBooking && db.checkIns.some((ci) => ci.memberId === member.id && ci.classId === nextBooking.id);

  const myChallenges = db.challengeProgress
    .filter((p) => p.memberId === member.id && !p.completedAt)
    .map((p) => ({ p, ch: db.challenges.find((c) => c.id === p.challengeId)! }))
    .filter((x) => x.ch && x.ch.active)
    .map((x) => ({ ...x, value: computeProgress(member.id, x.ch) }))
    .sort((a, b) => b.value / b.ch.goal - a.value / a.ch.goal)
    .slice(0, 3);

  const notifications = db.notifications.filter((n) => n.memberId === member.id).slice(0, 4);
  const unread = notifications.some((n) => !n.read);
  const streak = currentStreak(member.id);
  const firstName = member.name.split(" ")[0];

  return (
    <main className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="rise flex items-start justify-between">
        <div>
          <p className="text-[13px] font-medium uppercase tracking-[0.18em] text-smoke">ReformerX · Prague 1</p>
          <h1 className="font-display text-[34px] leading-tight">Hello, {firstName}</h1>
        </div>
        <div className="flex items-center gap-2">
          {streak > 0 && (
            <span className="rounded-full bg-spring-yellow/15 px-3 py-1.5 text-[13px] font-semibold text-spring-yellow">
              🔥 {streak}d
            </span>
          )}
        </div>
      </header>

      {/* Membership pass */}
      <section className={`rise rise-1 mt-5 rounded-xl2 p-5 text-white shadow-lift ${active ? "bg-ink" : "bg-spring-red"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-white.png" alt="" className="h-4 w-auto opacity-90" />
        <div className="flex items-center justify-between">
          <p className="font-display text-lg tracking-wide">REFORMER X</p>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${active ? "bg-spring-green/25 text-emerald-200" : "bg-white/20"}`}>
            {active ? "Active" : "Expired"}
          </span>
        </div>
        <p className="mt-4 text-[15px] font-medium">{member.membershipType}</p>
        <div className="mt-1 flex items-end justify-between">
          <p className="text-[13px] text-white/60">
            {active ? "Valid until" : "Expired"} {fmtDate(member.membershipExpires)}
          </p>
          <p className="text-[13px] text-white/60">{stats.points} pts</p>
        </div>
      </section>

      {/* Today's booking + quick check-in */}
      <section className="rise rise-2 mt-4 rounded-xl2 bg-card p-5 shadow-card">
        {nextBooking ? (
          <>
            <p className="text-[12px] font-semibold uppercase tracking-[0.15em] text-smoke">Next class</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-[22px]">{nextBooking.title}</p>
                <p className="mt-0.5 text-[14px] text-smoke">
                  {fmtDate(nextBooking.startsAt)} · {fmtTime(nextBooking.startsAt)} · {nextInstructor?.name}
                </p>
              </div>
              {alreadyIn ? (
                <span className="rounded-xl bg-spring-green/15 px-3 py-2 text-[13px] font-semibold text-spring-green">
                  Checked in ✓
                </span>
              ) : (
                <Link
                  href="/checkin"
                  className="rounded-xl bg-ink px-4 py-2.5 text-[14px] font-semibold text-white transition active:scale-95"
                >
                  Check in
                </Link>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-[20px]">No upcoming booking</p>
              <p className="mt-0.5 text-[14px] text-smoke">Reserve your next class to keep the streak alive.</p>
            </div>
            <a
              href="https://www.reformerx.cz/booking/"
              target="_blank"
              className="shrink-0 rounded-xl border border-line px-4 py-2.5 text-[14px] font-semibold"
            >
              Book
            </a>
          </div>
        )}
      </section>

      {/* Challenge progress */}
      <section className="rise rise-3 mt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[22px]">Your challenges</h2>
          <Link href="/challenges" className="text-[13px] font-semibold text-tan-deep">
            See all
          </Link>
        </div>
        <div className="mt-3 space-y-3">
          {myChallenges.length === 0 && (
            <div className="rounded-xl2 bg-card p-5 text-center shadow-card">
              <p className="text-[15px]">No active challenges yet.</p>
              <Link href="/challenges" className="mt-1 inline-block text-[14px] font-semibold text-tan-deep">
                Browse challenges →
              </Link>
            </div>
          )}
          {myChallenges.map(({ ch, value }) => (
            <Link key={ch.id} href={`/challenges/${ch.id}`} className="block rounded-xl2 bg-card p-4 shadow-card transition active:scale-[0.99]">
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
            </Link>
          ))}
        </div>
      </section>

      {/* Notifications */}
      {notifications.length > 0 && (
        <section className="mt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[22px]">Updates {unread && <span className="ml-1 inline-block h-2 w-2 rounded-full bg-ink align-middle" />}</h2>
            {unread && (
              <form action={markNotificationsRead}>
                <button className="text-[13px] font-semibold text-tan-deep">Mark read</button>
              </form>
            )}
          </div>
          <ul className="mt-3 space-y-2">
            {notifications.map((n) => (
              <li key={n.id} className={`rounded-xl bg-card px-4 py-3 text-[14px] shadow-card ${n.read ? "text-smoke" : ""}`}>
                {n.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
