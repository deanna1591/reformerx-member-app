import { getDB } from "@/lib/store";
import { decideRedemption } from "@/app/actions";
import { fmtDate } from "@/lib/engine";

export const dynamic = "force-dynamic";

export default function AdminRedemptions() {
  const db = getDB();
  const rows = [...db.redemptions].sort((a, b) => +new Date(b.requestedAt) - +new Date(a.requestedAt));
  return (
    <div>
      <h1 className="font-display text-[32px]">Redemptions</h1>
      <p className="mt-1 text-[13px] text-smoke">Approve requests, then hand over the reward at reception.</p>
      <div className="mt-5 space-y-3">
        {rows.map((rd) => {
          const member = db.members.find((m) => m.id === rd.memberId);
          const reward = db.rewards.find((r) => r.id === rd.rewardId);
          const label = reward ? `${reward.emoji} ${reward.name}` : rd.note;
          return (
            <div key={rd.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl2 bg-white p-4 shadow-card">
              <div>
                <p className="text-[15px] font-semibold">{label}</p>
                <p className="text-[13px] text-smoke">{member?.name} · {fmtDate(rd.requestedAt)}</p>
              </div>
              {rd.status === "pending" ? (
                <div className="flex gap-2">
                  <form action={async () => { "use server"; await decideRedemption(rd.id, "approved"); }}>
                    <button className="rounded-xl bg-spring-green px-4 py-2 text-[13px] font-semibold text-white">Approve</button>
                  </form>
                  <form action={async () => { "use server"; await decideRedemption(rd.id, "rejected"); }}>
                    <button className="rounded-xl border border-line px-4 py-2 text-[13px] font-semibold text-smoke">Decline</button>
                  </form>
                </div>
              ) : (
                <span className={`rounded-full px-3 py-1.5 text-[12px] font-semibold uppercase ${rd.status === "approved" ? "bg-spring-green/15 text-spring-green" : "bg-spring-red/15 text-spring-red"}`}>
                  {rd.status}
                </span>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-[14px] text-smoke">No redemption requests yet.</p>}
      </div>
    </div>
  );
}
