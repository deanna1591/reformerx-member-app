import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import { getDB } from "@/lib/store";
import RedeemButton from "@/components/RedeemButton";
import { fmtDate } from "@/lib/engine";

export const dynamic = "force-dynamic";

export default function RewardsPage() {
  const member = currentMember();
  if (!member) redirect("/login");
  const db = getDB();
  const points = db.points[member.id] ?? 0;
  const myRedemptions = db.redemptions
    .filter((r) => r.memberId === member.id)
    .sort((a, b) => +new Date(b.requestedAt) - +new Date(a.requestedAt))
    .slice(0, 6);

  return (
    <main className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <p className="text-[13px] font-medium uppercase tracking-[0.18em] text-smoke">Earn 10 pts per class</p>
      <h1 className="font-display text-[34px]">Rewards</h1>

      <div className="mt-4 rounded-xl2 bg-ink p-5 text-white shadow-lift">
        <p className="text-[13px] uppercase tracking-[0.15em] text-white/60">Your balance</p>
        <p className="font-display text-[40px] tabular-nums">{points} <span className="text-[20px] text-white/60">pts</span></p>
      </div>

      <div className="mt-5 space-y-3">
        {db.rewards.filter((r) => r.available).map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-xl2 bg-card p-4 shadow-card">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-sage-soft text-xl">{r.emoji}</span>
              <p className="text-[15px] font-semibold">{r.name}</p>
            </div>
            <RedeemButton rewardId={r.id} cost={r.cost} canAfford={points >= r.cost} />
          </div>
        ))}
      </div>

      {myRedemptions.length > 0 && (
        <section className="mt-7">
          <h2 className="font-display text-[22px]">Your requests</h2>
          <ul className="mt-3 space-y-2">
            {myRedemptions.map((rd) => {
              const reward = db.rewards.find((r) => r.id === rd.rewardId);
              const label = reward ? `${reward.emoji} ${reward.name}` : rd.note;
              const badge =
                rd.status === "approved"
                  ? "bg-spring-green/15 text-spring-green"
                  : rd.status === "rejected"
                  ? "bg-spring-red/15 text-spring-red"
                  : "bg-spring-yellow/15 text-spring-yellow";
              return (
                <li key={rd.id} className="flex items-center justify-between rounded-xl bg-card px-4 py-3 shadow-card">
                  <div>
                    <p className="text-[14px] font-medium">{label}</p>
                    <p className="text-[12px] text-smoke">{fmtDate(rd.requestedAt)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${badge}`}>{rd.status}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
