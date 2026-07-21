import { redirect } from "next/navigation";
import Link from "next/link";
import { currentMember } from "@/lib/auth";
import { getDB } from "@/lib/store";
import { computeProgress } from "@/lib/engine";
import CarriageProgress from "@/components/CarriageProgress";
import { joinChallenge } from "@/app/actions";

export const dynamic = "force-dynamic";

export default function ChallengesPage() {
  const member = currentMember();
  if (!member) redirect("/login");
  const db = getDB();
  const active = db.challenges.filter((c) => c.active);
  const joined = new Set(
    db.challengeProgress.filter((p) => p.memberId === member.id).map((p) => p.challengeId)
  );

  const mine = active.filter((c) => joined.has(c.id));
  const available = active.filter((c) => !joined.has(c.id));

  const card = (ch: (typeof active)[number], isJoined: boolean) => {
    const value = isJoined ? computeProgress(member.id, ch) : 0;
    const done = db.challengeProgress.find(
      (p) => p.memberId === member.id && p.challengeId === ch.id
    )?.completedAt;
    return (
      <div key={ch.id} className="rounded-xl2 bg-card p-4 shadow-card">
        <Link href={`/challenges/${ch.id}`} className="block">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[16px] font-semibold">
                {ch.emoji} {ch.name} {done && <span className="text-spring-green">✓</span>}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-smoke">{ch.description}</p>
            </div>
            {isJoined && (
              <p className="shrink-0 text-[13px] font-semibold tabular-nums text-smoke">
                {value}/{ch.goal}
              </p>
            )}
          </div>
          {isJoined && (
            <div className="mt-3">
              <CarriageProgress value={value} goal={ch.goal} color={ch.springColor} />
            </div>
          )}
        </Link>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[12px] font-medium text-plum">🎁 {ch.reward}</p>
          {!isJoined && (
            <form
              action={async () => {
                "use server";
                await joinChallenge(ch.id);
              }}
            >
              <button className="rounded-xl bg-plum px-4 py-2 text-[13px] font-semibold text-white active:scale-95">
                Join
              </button>
            </form>
          )}
        </div>
      </div>
    );
  };

  return (
    <main className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <p className="text-[13px] font-medium uppercase tracking-[0.18em] text-smoke">Push the carriage</p>
      <h1 className="font-display text-[34px]">Challenges</h1>

      {mine.length > 0 && (
        <>
          <h2 className="mt-5 text-[13px] font-semibold uppercase tracking-[0.15em] text-smoke">In progress</h2>
          <div className="mt-2 space-y-3">{mine.map((c) => card(c, true))}</div>
        </>
      )}
      {available.length > 0 && (
        <>
          <h2 className="mt-6 text-[13px] font-semibold uppercase tracking-[0.15em] text-smoke">Open to join</h2>
          <div className="mt-2 space-y-3">{available.map((c) => card(c, false))}</div>
        </>
      )}
    </main>
  );
}
