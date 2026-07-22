import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import { getDB, ensureDB } from "@/lib/store";
import { fmtDate, fmtTime, membershipActive, memberStats, personalRecords } from "@/lib/engine";
import QRDisplay from "@/components/QRDisplay";
import { memberLogout } from "@/app/actions";
import PushOptIn from "@/components/PushOptIn";
import ShareButton from "@/components/ShareButton";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");
  const db = getDB();
  const stats = memberStats(member.id);
  const records = personalRecords(member.id);
  const active = membershipActive(member);

  const badges = db.earnedBadges
    .filter((b) => b.memberId === member.id)
    .map((b) => ({ ...b, def: db.badgeDefs.find((d) => d.id === b.badgeId)! }))
    .filter((b) => b.def);
  const lockedBadges = db.badgeDefs.filter((d) => !badges.some((b) => b.badgeId === d.id));

  const history = db.checkIns
    .filter((ci) => ci.memberId === member.id)
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 8)
    .map((ci) => ({ ci, cls: db.classes.find((c) => c.id === ci.classId) }));

  const stat = (label: string, value: string | number) => (
    <div className="rounded-xl2 border border-line bg-white p-4">
      <p className="font-display text-[26px] tabular-nums leading-none">{value}</p>
      <p className="mt-1.5 text-[12px] font-medium uppercase tracking-wider text-smoke">{label}</p>
    </div>
  );

  return (
    <main className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] font-medium uppercase tracking-[0.18em] text-smoke">Member since {fmtDate(member.joinedAt)}</p>
          <h1 className="font-display text-[34px]">{member.name}</h1>
          <p className="text-[14px] text-smoke">
            {member.membershipType} · {active ? `valid until ${fmtDate(member.membershipExpires)}` : "expired"}
          </p>
        </div>
      </div>

      <section className="mt-5 grid grid-cols-2 gap-3">
        {stat("Total classes", stats.total)}
        {stat("Hours on the reformer", stats.hours)}
        {stat("Current streak", `${stats.streak}d`)}
        {stat("This month", stats.thisMonth)}
        {stat("Favourite coach", stats.favInstructor)}
        {stat("Favourite time", stats.favTime)}
      </section>

      <section className="mt-7">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[22px]">Personal records</h2>
          <ShareButton
            label="Share"
            text={`My ReformerX records: ${stats.total} classes, longest streak ${records.longestStreak} days${records.bestMonth ? `, best month ${records.bestMonth.count} classes` : ""}. 🖤`}
          />
        </div>
        <div className="mt-3 divide-y divide-line rounded-xl2 border border-line bg-white">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-[14px]">🔥 Longest streak</p>
            <p className="text-[14px] font-semibold tabular-nums">{records.longestStreak} days</p>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-[14px]">📆 Best month</p>
            <p className="text-[14px] font-semibold">
              {records.bestMonth ? `${records.bestMonth.count} classes · ${records.bestMonth.label}` : "—"}
            </p>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-[14px]">🚃 First class</p>
            <p className="text-[14px] font-semibold">{records.firstClass ? fmtDate(records.firstClass) : "—"}</p>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-[14px]">🤝 Friends brought in</p>
            <p className="text-[14px] font-semibold tabular-nums">{records.referrals}</p>
          </div>
        </div>
      </section>

      <section className="mt-7 rounded-xl2 bg-ink p-5 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sage">Bring a friend</p>
        <p className="mt-2 text-[14px] leading-relaxed text-white/80">
          Give a friend your member code. When they join with it and take their first class, you both win — you get the Bring a Friend reward.
        </p>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white/10 px-4 py-3">
          <p className="font-display text-[18px] tracking-wide">{member.qrCode}</p>
          <ShareButton
            label="Invite"
            text={`Join me at ReformerX (Prague 1)! Use my member code ${member.qrCode} when you sign in to the app. 🤸`}
          />
        </div>
      </section>

      <section className="mt-7 rounded-xl2 border border-line bg-white p-5">
        <h2 className="font-display text-[18px]">Notifications</h2>
        <p className="mt-1 text-[13px] text-smoke">Get pinged when rewards are ready and milestones hit.</p>
        <div className="mt-3">
          <PushOptIn vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
        </div>
      </section>

      <section className="mt-7">
        <h2 className="font-display text-[22px]">Badges</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {badges.map((b) => (
            <div key={b.badgeId} className="rounded-xl2 border border-line bg-white p-4">
              <p className="text-2xl">{b.def.emoji}</p>
              <p className="mt-1 text-[14px] font-semibold">{b.def.name}</p>
              <p className="text-[12px] text-smoke">{fmtDate(b.earnedAt)}</p>
            </div>
          ))}
          {lockedBadges.map((d) => (
            <div key={d.id} className="rounded-xl2 border border-dashed border-line p-4 opacity-60">
              <p className="text-2xl grayscale">{d.emoji}</p>
              <p className="mt-1 text-[14px] font-semibold">{d.name}</p>
              <p className="text-[12px] text-smoke">{d.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-7 rounded-xl2 bg-card p-5 text-center shadow-card">
        <p className="text-[12px] font-semibold uppercase tracking-[0.15em] text-smoke">Your member QR</p>
        <div className="mt-3 flex justify-center">
          <QRDisplay value={member.qrCode} size={180} />
        </div>
      </section>

      <section className="mt-7">
        <h2 className="font-display text-[22px]">Recent classes</h2>
        <ul className="mt-3 space-y-2">
          {history.map(({ ci, cls }) => (
            <li key={ci.id} className="flex items-center justify-between rounded-xl bg-card px-4 py-3 shadow-card">
              <p className="text-[14px] font-medium">{cls?.title ?? "Class"}</p>
              <p className="text-[13px] tabular-nums text-smoke">
                {fmtDate(ci.at)} · {fmtTime(ci.at)}
              </p>
            </li>
          ))}
          {history.length === 0 && <li className="text-[14px] text-smoke">No classes yet — your first one is waiting.</li>}
        </ul>
      </section>

      <form action={memberLogout} className="mt-8 pb-4">
        <button className="w-full rounded-xl border border-line bg-white py-3 text-[14px] font-semibold text-smoke">
          Sign out
        </button>
      </form>
    </main>
  );
}
