import { getDB, ensureDB } from "@/lib/store";
import { fmtDate } from "@/lib/engine";
import { setRewardStatus } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function AdminRewards() {
  await ensureDB();
  const db = getDB();
  const rewards = [...db.earnedRewards].sort((a, b) => +new Date(b.earnedAt) - +new Date(a.earnedAt));
  const queue = rewards.filter((r) => r.status === "earned");
  const ready = rewards.filter((r) => r.status === "ready");
  const done = rewards.filter((r) => r.status === "collected" || r.status === "declined").slice(0, 20);
  const name = (id: string) => db.members.find((m) => m.id === id)?.name ?? "Member";

  return (
    <div>
      <h1 className="font-display text-[32px]">Reward fulfillment</h1>
      <p className="mt-1 max-w-xl text-[13px] text-smoke">
        Rewards are earned automatically when a member completes a challenge. Confirm each one when it&apos;s prepared, then mark it collected at handover.
      </p>

      <section className="mt-6">
        <h2 className="font-display text-[20px]">To prepare <span className="ml-1 rounded-full bg-sage-soft px-2 py-0.5 text-[12px] font-sans font-semibold normal-case tracking-normal">{queue.length}</span></h2>
        <div className="mt-3 overflow-hidden rounded-xl2 bg-white shadow-card">
          {queue.length === 0 ? (
            <p className="px-5 py-6 text-[14px] text-smoke">Nothing waiting — the queue is clear.</p>
          ) : (
            <table className="w-full text-left text-[14px]">
              <thead className="border-b border-line text-[12px] uppercase tracking-wider text-smoke">
                <tr>
                  <th className="px-5 py-3">Member</th>
                  <th className="px-5 py-3">Reward</th>
                  <th className="px-5 py-3">Challenge</th>
                  <th className="px-5 py-3">Earned</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {queue.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 font-medium">{name(r.memberId)}</td>
                    <td className="px-5 py-3">{r.rewardEmoji} {r.reward}</td>
                    <td className="px-5 py-3 text-smoke">{r.challengeName}</td>
                    <td className="px-5 py-3 text-smoke">{fmtDate(r.earnedAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <form action={async () => { "use server"; await setRewardStatus(r.id, "ready"); }}>
                          <button className="rounded-lg bg-ink px-3 py-1.5 text-[13px] font-semibold text-white">Mark ready</button>
                        </form>
                        <form action={async () => { "use server"; await setRewardStatus(r.id, "declined"); }}>
                          <button className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-smoke">Decline</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-[20px]">Awaiting pickup <span className="ml-1 rounded-full bg-sage-soft px-2 py-0.5 text-[12px] font-sans font-semibold normal-case tracking-normal">{ready.length}</span></h2>
        <div className="mt-3 overflow-hidden rounded-xl2 bg-white shadow-card">
          {ready.length === 0 ? (
            <p className="px-5 py-6 text-[14px] text-smoke">No rewards waiting at reception.</p>
          ) : (
            <table className="w-full text-left text-[14px]">
              <tbody className="divide-y divide-line">
                {ready.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 font-medium">{name(r.memberId)}</td>
                    <td className="px-5 py-3">{r.rewardEmoji} {r.reward}</td>
                    <td className="px-5 py-3 text-smoke">{r.challengeName}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end">
                        <form action={async () => { "use server"; await setRewardStatus(r.id, "collected"); }}>
                          <button className="rounded-lg border border-ink px-3 py-1.5 text-[13px] font-semibold">Mark collected</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {done.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-[20px]">Recent history</h2>
          <div className="mt-3 divide-y divide-line overflow-hidden rounded-xl2 bg-white shadow-card">
            {done.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3 text-[14px]">
                <span>{name(r.memberId)} · {r.rewardEmoji} {r.reward}</span>
                <span className="text-[12px] uppercase tracking-wider text-smoke">{r.status} · {fmtDate(r.decidedAt ?? r.earnedAt)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
