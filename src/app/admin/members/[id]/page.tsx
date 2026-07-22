import Link from "next/link";
import { notFound } from "next/navigation";
import { getDB, ensureDB } from "@/lib/store";
import { computeProgress, fmtDate, fmtTime, membershipActive, memberStats, personalRecords } from "@/lib/engine";
import { adminCheckIn, extendMembership, sendMemberMessage, updateMembership } from "@/app/actions";

export const dynamic = "force-dynamic";

const TYPES = ["Member", "Monthly Pass", "Unlimited", "Package 10", "Single Entry"] as const;

export default async function MemberDetail({ params }: { params: { id: string } }) {
  await ensureDB();
  const db = getDB();
  const m = db.members.find((x) => x.id === params.id);
  if (!m) notFound();

  const active = membershipActive(m);
  const stats = memberStats(m.id);
  const records = personalRecords(m.id);

  const history = db.checkIns
    .filter((ci) => ci.memberId === m.id)
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 12)
    .map((ci) => ({ ci, cls: db.classes.find((c) => c.id === ci.classId) }));

  const now = Date.now();
  const upcoming = db.bookings
    .filter((b) => b.memberId === m.id)
    .map((b) => db.classes.find((c) => c.id === b.classId))
    .filter((c): c is NonNullable<typeof c> => Boolean(c && new Date(c.startsAt).getTime() > now - 60 * 60000))
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
    .slice(0, 5);

  // classes today the member could be checked in to manually
  const todayStr = new Date().toDateString();
  const todaysClasses = db.classes
    .filter((c) => new Date(c.startsAt).toDateString() === todayStr)
    .filter((c) => !db.checkIns.some((ci) => ci.memberId === m.id && ci.classId === c.id))
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));

  const challenges = db.challengeProgress
    .filter((p) => p.memberId === m.id)
    .map((p) => ({ p, ch: db.challenges.find((c) => c.id === p.challengeId)! }))
    .filter((x) => x.ch);

  const rewards = db.earnedRewards.filter((r) => r.memberId === m.id);
  const expiresDefault = active ? m.membershipExpires.slice(0, 10) : "";

  return (
    <div className="max-w-4xl">
      <Link href="/admin/members" className="text-[13px] font-semibold text-smoke">← Members</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[32px]">{m.name}</h1>
          <p className="text-[14px] text-smoke">{m.email} · code {m.qrCode}{m.simplybookId ? ` · SimplyBook #${m.simplybookId}` : ""}</p>
        </div>
        <span className={`mt-2 rounded-full px-3 py-1.5 text-[12px] font-semibold uppercase ${active ? "bg-spring-green/15 text-spring-green" : "bg-spring-red/15 text-spring-red"}`}>
          {active ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* Membership management */}
        <section className="rounded-xl2 bg-white p-5 shadow-card">
          <h2 className="font-display text-[20px]">Membership</h2>
          <p className="mt-1 text-[13px] text-smoke">
            {m.membershipType} · {active ? `valid until ${fmtDate(m.membershipExpires)}` : "not active"}
          </p>
          <form action={updateMembership.bind(null, m.id)} className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="type" className="text-[12px] font-semibold uppercase tracking-wider text-smoke">Type</label>
              <select id="type" name="type" defaultValue={m.membershipType} className="mt-1 block rounded-xl border border-line bg-white px-3 py-2 text-[14px]">
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="expires" className="text-[12px] font-semibold uppercase tracking-wider text-smoke">Valid until</label>
              <input id="expires" name="expires" type="date" defaultValue={expiresDefault} className="mt-1 block rounded-xl border border-line bg-white px-3 py-2 text-[14px]" />
            </div>
            <button className="rounded-xl bg-ink px-4 py-2.5 text-[13px] font-semibold text-white">Save</button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={extendMembership.bind(null, m.id, 30)}>
              <button className="rounded-full border border-line bg-white px-3 py-1.5 text-[12px] font-semibold">+30 days</button>
            </form>
            <form action={extendMembership.bind(null, m.id, 90)}>
              <button className="rounded-full border border-line bg-white px-3 py-1.5 text-[12px] font-semibold">+90 days</button>
            </form>
          </div>
          <p className="mt-3 text-[12px] text-smoke">
            Note: syncs only ever <em>extend</em> status from booking activity, so a later manual date is safe; an earlier one may be re-extended if the member keeps booking.
          </p>
        </section>

        {/* Manual check-in */}
        <section className="rounded-xl2 bg-white p-5 shadow-card">
          <h2 className="font-display text-[20px]">Front-desk check-in</h2>
          <p className="mt-1 text-[13px] text-smoke">
            Record attendance manually (phone died, QR trouble). Counts toward challenges, badges, and rewards exactly like a scan.
          </p>
          {todaysClasses.length === 0 ? (
            <p className="mt-4 rounded-xl bg-chalk px-3 py-2.5 text-[13px] text-smoke">No remaining classes today.</p>
          ) : (
            <form action={adminCheckIn.bind(null, m.id)} className="mt-4 flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <label htmlFor="classId" className="text-[12px] font-semibold uppercase tracking-wider text-smoke">Class today</label>
                <select id="classId" name="classId" className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 text-[14px]">
                  {todaysClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {fmtTime(c.startsAt)} · {c.title} · {db.instructors.find((i) => i.id === c.instructorId)?.name ?? ""}
                    </option>
                  ))}
                </select>
              </div>
              <button className="rounded-xl bg-ink px-4 py-2.5 text-[13px] font-semibold text-white">Check in</button>
            </form>
          )}

          <h2 className="mt-6 font-display text-[20px]">Message this member</h2>
          <form action={sendMemberMessage.bind(null, m.id)} className="mt-2 flex gap-2">
            <input name="text" placeholder="e.g. Your grip socks arrived — pick them up anytime!" className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3.5 py-2 text-[14px] outline-none focus:border-ink" />
            <button className="rounded-xl bg-ink px-4 py-2.5 text-[13px] font-semibold text-white">Send</button>
          </form>
          <p className="mt-1.5 text-[12px] text-smoke">Delivered in-app, plus push if they opted in.</p>
        </section>
      </div>

      {/* Stats */}
      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Total classes", stats.total],
          ["This month", stats.thisMonth],
          ["Current streak", `${stats.streak}d`],
          ["Longest streak", `${records.longestStreak}d`],
          ["Hours", stats.hours],
          ["Fav coach", stats.favInstructor],
          ["Friends referred", records.referrals],
          ["Rewards collected", stats.rewardsCollected],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl2 bg-white p-4 shadow-card">
            <p className="font-display text-[22px] leading-none">{value}</p>
            <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wider text-smoke">{label}</p>
          </div>
        ))}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Upcoming + history */}
        <section className="rounded-xl2 bg-white p-5 shadow-card">
          <h2 className="font-display text-[20px]">Upcoming bookings</h2>
          {upcoming.length === 0 ? (
            <p className="mt-2 text-[13px] text-smoke">Nothing booked.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {upcoming.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2.5 text-[14px]">
                  <span>{c.title}</span>
                  <span className="tabular-nums text-smoke">{fmtDate(c.startsAt)} · {fmtTime(c.startsAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <h2 className="mt-5 font-display text-[20px]">Recent attendance</h2>
          {history.length === 0 ? (
            <p className="mt-2 text-[13px] text-smoke">No check-ins yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {history.map(({ ci, cls }) => (
                <li key={ci.id} className="flex items-center justify-between py-2.5 text-[14px]">
                  <span>{cls?.title ?? "Class"}</span>
                  <span className="tabular-nums text-smoke">{fmtDate(ci.at)} · {fmtTime(ci.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Challenges + rewards */}
        <section className="rounded-xl2 bg-white p-5 shadow-card">
          <h2 className="font-display text-[20px]">Challenges</h2>
          {challenges.length === 0 ? (
            <p className="mt-2 text-[13px] text-smoke">Not in any challenges.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {challenges.map(({ p, ch }) => (
                <li key={ch.id} className="flex items-center justify-between py-2.5 text-[14px]">
                  <span>{ch.emoji} {ch.name}</span>
                  <span className="tabular-nums font-semibold">
                    {p.completedAt ? "Done ✓" : `${computeProgress(m.id, ch)}/${ch.goal}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h2 className="mt-5 font-display text-[20px]">Rewards</h2>
          {rewards.length === 0 ? (
            <p className="mt-2 text-[13px] text-smoke">None earned yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {rewards.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2.5 text-[14px]">
                  <span>{r.rewardEmoji} {r.reward}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-smoke">{r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
