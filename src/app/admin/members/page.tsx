import { getDB } from "@/lib/store";
import { fmtDate, membershipActive, memberStats } from "@/lib/engine";
import { simulateSimplybookSync } from "@/app/actions";

export const dynamic = "force-dynamic";

export default function AdminMembers() {
  const db = getDB();
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[32px]">Members</h1>
        <form action={simulateSimplybookSync}>
          <button className="rounded-xl bg-ink px-4 py-2.5 text-[13px] font-semibold text-white">
            ↻ Sync from SimplyBook
          </button>
        </form>
      </div>
      <p className="mt-1 text-[13px] text-smoke">
        Memberships are read from SimplyBook. In production this syncs via the SimplyBook admin API + webhooks (see docs/SIMPLYBOOK_INTEGRATION.md).
      </p>
      {db.settings.lastSync && (() => {
        const [at, status, ...rest] = db.settings.lastSync!.split("|");
        const msg = rest.join("|");
        const tone =
          status === "ok"
            ? "border-spring-green/40 bg-spring-green/10 text-ink"
            : status === "err"
            ? "border-spring-red/40 bg-spring-red/10 text-ink"
            : "border-line bg-white text-smoke";
        return (
          <div className={`mt-3 rounded-xl border px-4 py-3 text-[13px] ${tone}`}>
            <span className="font-semibold">Last sync</span> · {new Date(at).toLocaleString()} — {msg}
          </div>
        );
      })()}
      <div className="mt-5 overflow-hidden rounded-xl2 bg-white shadow-card">
        <table className="w-full text-left text-[14px]">
          <thead className="border-b border-line text-[12px] uppercase tracking-wider text-smoke">
            <tr>
              <th className="px-5 py-3">Member</th>
              <th className="px-5 py-3">Membership</th>
              <th className="px-5 py-3">Expires</th>
              <th className="px-5 py-3">Classes</th>
              <th className="px-5 py-3">Points</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {db.members.map((m) => {
              const active = membershipActive(m);
              const stats = memberStats(m.id);
              return (
                <tr key={m.id} className="border-b border-line/60 last:border-0">
                  <td className="px-5 py-3">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-[12px] text-smoke">{m.email}</p>
                  </td>
                  <td className="px-5 py-3">{m.membershipType}</td>
                  <td className="px-5 py-3 tabular-nums">{fmtDate(m.membershipExpires)}</td>
                  <td className="px-5 py-3 tabular-nums">{stats.total}</td>
                  <td className="px-5 py-3 tabular-nums">{stats.points}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${active ? "bg-spring-green/15 text-spring-green" : "bg-spring-red/15 text-spring-red"}`}>
                      {active ? "Active" : "Expired"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
