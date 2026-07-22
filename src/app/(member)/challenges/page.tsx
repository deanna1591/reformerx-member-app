import { redirect } from "next/navigation";
import Link from "next/link";
import { currentMember } from "@/lib/auth";
import { getDB, ensureDB } from "@/lib/store";
import { computeProgress } from "@/lib/engine";
import CarriageProgress from "@/components/CarriageProgress";
import { joinChallenge } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function ChallengesPage() {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");
  const db = getDB();
  const active = db.challenges.filter((c) => c.active);
  const progressOf = (id: string) =>
    db.challengeProgress.find((p) => p.memberId === member.id && p.challengeId === id);

  const mine = active.filter((c) => progressOf(c.id) && !progressOf(c.id)?.completedAt);
  const completed = active.filter((c) => progressOf(c.id)?.completedAt);
  const available = active.filter((c) => !progressOf(c.id));

  return (
    <main className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="rise">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-tan-deep">Challenges</p>
        <h1 className="mt-1 font-display text-[34px] leading-[0.98]">Pick a goal.<br />Earn the reward.</h1>
      </header>

      {mine.length > 0 && (
        <section className="rise rise-1 mt-6">
          <h2 className="font-display text-[20px]">In progress</h2>
          <div className="mt-3 space-y-3">
            {mine.map((ch) => {
              const value = computeProgress(member.id, ch);
              return (
                <Link key={ch.id} href={`/challenges/${ch.id}`} className="block rounded-xl2 border border-line bg-white p-4 transition active:scale-[0.99]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[15px] font-semibold">{ch.emoji} {ch.name}</p>
                    <p className="text-[13px] font-semibold tabular-nums text-smoke">{value}/{ch.goal}</p>
                  </div>
                  <div className="mt-3">
                    <CarriageProgress value={value} goal={ch.goal} color={ch.springColor} />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-soft px-2.5 py-1 text-[12px] font-medium">
                      {ch.rewardEmoji ?? "🎁"} {ch.reward}
                    </span>
                    <span className="text-[12px] font-semibold text-tan-deep">{Math.max(0, ch.goal - value)} to go</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="rise rise-2 mt-7">
        <h2 className="font-display text-[20px]">Open to join</h2>
        {available.length === 0 ? (
          <p className="mt-3 rounded-xl2 border border-dashed border-line bg-white p-5 text-center text-[14px] text-smoke">
            You&apos;re in every active challenge. Impressive.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {available.map((ch) => (
              <div key={ch.id} className="rounded-xl2 border border-line bg-white p-4">
                <Link href={`/challenges/${ch.id}`} className="block">
                  <p className="text-[15px] font-semibold">{ch.emoji} {ch.name}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-smoke">{ch.description}</p>
                </Link>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-sage-soft px-2.5 py-1 text-[12px] font-medium">
                    <span className="shrink-0">{ch.rewardEmoji ?? "🎁"}</span>
                    <span className="truncate">{ch.reward}</span>
                  </span>
                  <form action={async () => { "use server"; await joinChallenge(ch.id); }}>
                    <button className="shrink-0 rounded-xl bg-ink px-4 py-2 text-[13px] font-semibold text-white active:scale-95">
                      Join
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {completed.length > 0 && (
        <section className="rise rise-3 mt-7 pb-4">
          <h2 className="font-display text-[20px]">Completed</h2>
          <div className="mt-3 divide-y divide-line rounded-xl2 border border-line bg-white">
            {completed.map((ch) => (
              <Link key={ch.id} href={`/challenges/${ch.id}`} className="flex items-center justify-between px-4 py-3">
                <p className="text-[14px] font-medium">{ch.emoji} {ch.name}</p>
                <span className="text-[12px] font-semibold text-spring-green">Done ✓</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
