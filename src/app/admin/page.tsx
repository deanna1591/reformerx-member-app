import { getDB } from "@/lib/store";
import { computeProgress } from "@/lib/engine";
import { sendAnnouncement, resetDemoData } from "@/app/actions";

export const dynamic = "force-dynamic";

export default function AdminOverview() {
  const db = getDB();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

  const checkinsWeek = db.checkIns.filter((c) => new Date(c.at) >= weekAgo).length;
  const checkinsMonth = db.checkIns.filter((c) => new Date(c.at) >= monthAgo).length;
  const activeMembers = db.members.filter((m) => new Date(m.membershipExpires) >= now).length;
  const pending = db.redemptions.filter((r) => r.status === "pending").length;

  const challengeRows = db.challenges.map((ch) => {
    const parts = db.challengeProgress.filter((p) => p.challengeId === ch.id);
    const completed = parts.filter((p) => p.completedAt || computeProgress(p.memberId, ch) >= ch.goal).length;
    return { ch, joined: parts.length, completed };
  });

  const inactive = db.members.filter(
    (m) => !db.checkIns.some((ci) => ci.memberId === m.id && new Date(ci.at) >= new Date(now.getTime() - 14 * 24 * 3600 * 1000))
  );

  const kpi = (label: string, value: string | number, sub?: string) => (
    <div className="rounded-xl2 bg-white p-5 shadow-card">
      <p className="font-display text-[32px] tabular-nums leading-none">{value}</p>
      <p className="mt-2 text-[13px] font-medium text-smoke">{label}</p>
      {sub && <p className="text-[12px] text-smoke/70">{sub}</p>}
    </div>
  );

  return (
    <div>
      <h1 className="font-display text-[32px]">Overview</h1>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpi("Check-ins this week", checkinsWeek)}
        {kpi("Check-ins last 30 days", checkinsMonth)}
        {kpi("Active memberships", `${activeMembers}/${db.members.length}`)}
        {kpi("Pending redemptions", pending)}
      </div>

      <h2 className="mt-10 font-display text-[22px]">Challenge participation</h2>
      <div className="mt-3 overflow-hidden rounded-xl2 bg-white shadow-card">
        <table className="w-full text-left text-[14px]">
          <thead className="border-b border-line text-[12px] uppercase tracking-wider text-smoke">
            <tr>
              <th className="px-5 py-3">Challenge</th>
              <th className="px-5 py-3">Joined</th>
              <th className="px-5 py-3">Completed</th>
              <th className="px-5 py-3">Completion rate</th>
            </tr>
          </thead>
          <tbody>
            {challengeRows.map(({ ch, joined, completed }) => (
              <tr key={ch.id} className="border-b border-line/60 last:border-0">
                <td className="px-5 py-3 font-medium">{ch.emoji} {ch.name}</td>
                <td className="px-5 py-3 tabular-nums">{joined}</td>
                <td className="px-5 py-3 tabular-nums">{completed}</td>
                <td className="px-5 py-3 tabular-nums">{joined ? Math.round((completed / joined) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="font-display text-[22px]">Quiet members (14+ days)</h2>
          <ul className="mt-3 space-y-2">
            {inactive.map((m) => (
              <li key={m.id} className="flex justify-between rounded-xl bg-white px-4 py-3 text-[14px] shadow-card">
                <span className="font-medium">{m.name}</span>
                <span className="text-smoke">{m.email}</span>
              </li>
            ))}
            {inactive.length === 0 && <li className="text-[14px] text-smoke">Everyone has visited recently 🎉</li>}
          </ul>
        </section>
        <section>
          <h2 className="font-display text-[22px]">Send announcement</h2>
          <form action={sendAnnouncement} className="mt-3 space-y-3 rounded-xl2 bg-white p-5 shadow-card">
            <textarea name="text" rows={3} placeholder="New Saturday 9:00 Power Reformer class starts this week…" />
            <button className="rounded-xl bg-ink px-5 py-2.5 text-[14px] font-semibold text-white">Send to all members</button>
          </form>
          <form action={resetDemoData} className="mt-4">
            <button className="text-[12px] font-medium text-smoke underline">Reset demo data</button>
          </form>
        </section>
      </div>
    </div>
  );
}
