import Link from "next/link";
import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import { getDB, ensureDB } from "@/lib/store";
import { computeProgress, fmtDate } from "@/lib/engine";
import CarriageProgress from "@/components/CarriageProgress";

export const dynamic = "force-dynamic";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  earned: { label: "Being prepared", cls: "bg-sage-soft text-ink" },
  ready: { label: "Ready at reception", cls: "bg-ink text-white" },
  collected: { label: "Collected", cls: "bg-chalk text-smoke border border-line" },
  declined: { label: "See reception", cls: "bg-spring-red/10 text-spring-red" },
};

export default async function Rewards() {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");
  const db = getDB();

  const mine = db.earnedRewards
    .filter((r) => r.memberId === member.id)
    .sort((a, b) => +new Date(b.earnedAt) - +new Date(a.earnedAt));
  const open = mine.filter((r) => r.status === "earned" || r.status === "ready");
  const history = mine.filter((r) => r.status === "collected" || r.status === "declined");

  // Rewards still on the table: active challenges joined but not completed
  const inPlay = db.challengeProgress
    .filter((p) => p.memberId === member.id && !p.completedAt)
    .map((p) => db.challenges.find((c) => c.id === p.challengeId)!)
    .filter((ch) => ch && ch.active)
    .map((ch) => ({ ch, value: computeProgress(member.id, ch) }))
    .sort((a, b) => b.value / b.ch.goal - a.value / a.ch.goal);

  return (
    <main className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="rise">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-tan-deep">Rewards</p>
        <h1 className="mt-1 font-display text-[34px] leading-[0.98]">Earn it.<br />Wear it.</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-smoke">
          Every challenge has a reward attached. Complete it and the studio prepares your reward for pickup — no points, no catalog.
        </p>
      </header>

      {open.length > 0 && (
        <section className="rise rise-1 mt-6">
          <h2 className="font-display text-[20px]">Your rewards</h2>
          <div className="mt-3 space-y-3">
            {open.map((r) => (
              <div key={r.id} className="rounded-[18px] border border-line bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-ink text-2xl">{r.rewardEmoji}</span>
                    <div>
                      <p className="text-[15px] font-semibold leading-snug">{r.reward}</p>
                      <p className="mt-0.5 text-[12px] text-smoke">
                        {r.challengeName} · {fmtDate(r.earnedAt)}
                      </p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_META[r.status].cls}`}>
                    {STATUS_META[r.status].label}
                  </span>
                </div>
                {r.status === "ready" && (
                  <>
                    <div className="mx-1 mt-3 border-t-2 border-dashed border-[#C9C6B8]" />
                    <p className="px-1 pt-2.5 text-[12px] text-[#55533F]">
                      Show this screen at reception — they have it waiting. 🎉
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rise rise-2 mt-7">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[20px]">On the table</h2>
          <Link href="/challenges" className="text-[13px] font-semibold text-tan-deep">
            All challenges →
          </Link>
        </div>
        {inPlay.length === 0 ? (
          <div className="mt-3 rounded-xl2 border border-dashed border-line bg-white p-6 text-center">
            <p className="text-3xl">🎯</p>
            <p className="mt-2 text-[14px] text-smoke">
              Join a challenge to put a reward on the table.
            </p>
            <Link href="/challenges" className="mt-4 inline-block rounded-xl bg-ink px-5 py-2.5 text-[14px] font-semibold text-white">
              Browse challenges
            </Link>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {inPlay.map(({ ch, value }) => (
              <Link key={ch.id} href={`/challenges/${ch.id}`} className="block rounded-xl2 border border-line bg-white p-4 transition active:scale-[0.99]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-chalk text-2xl">{ch.rewardEmoji ?? "🎁"}</span>
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold">{ch.reward}</p>
                      <p className="truncate text-[12px] text-smoke">
                        {ch.emoji} {ch.name}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-[13px] font-semibold text-tan-deep">
                    {Math.max(0, ch.goal - value)} to go
                  </span>
                </div>
                <div className="mt-3">
                  <CarriageProgress value={value} goal={ch.goal} color={ch.springColor} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section className="rise rise-3 mt-7 pb-4">
          <h2 className="font-display text-[20px]">History</h2>
          <div className="mt-3 divide-y divide-line rounded-xl2 border border-line bg-white">
            {history.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-xl">{r.rewardEmoji}</span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">{r.reward}</p>
                    <p className="truncate text-[12px] text-smoke">{fmtDate(r.decidedAt ?? r.earnedAt)}</p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_META[r.status].cls}`}>
                  {STATUS_META[r.status].label}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
