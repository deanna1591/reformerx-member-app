import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { currentMember } from "@/lib/auth";
import { getDB } from "@/lib/store";
import { computeProgress, fmtDate, leaderboard } from "@/lib/engine";
import CarriageProgress from "@/components/CarriageProgress";
import { joinChallenge } from "@/app/actions";

export const dynamic = "force-dynamic";

export default function ChallengeDetail({ params }: { params: { id: string } }) {
  const member = currentMember();
  if (!member) redirect("/login");
  const db = getDB();
  const ch = db.challenges.find((c) => c.id === params.id);
  if (!ch) notFound();

  const progress = db.challengeProgress.find(
    (p) => p.memberId === member.id && p.challengeId === ch.id
  );
  const value = progress ? computeProgress(member.id, ch) : 0;
  const board = ch.leaderboard && db.settings.leaderboardsEnabled ? leaderboard(ch.id) : null;

  const typeLabel: Record<string, string> = {
    class_count: "Classes in period",
    streak_days: "Consecutive days",
    instructor_variety: "Different instructors",
    lifetime_count: "Lifetime classes",
  };

  return (
    <main className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link href="/challenges" className="text-[13px] font-semibold text-plum">← Challenges</Link>
      <h1 className="mt-2 font-display text-[32px] leading-tight">{ch.emoji} {ch.name}</h1>
      <p className="mt-2 text-[15px] text-smoke">{ch.description}</p>

      <section className="mt-5 rounded-xl2 bg-card p-5 shadow-card">
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] font-semibold uppercase tracking-[0.15em] text-smoke">{typeLabel[ch.type]}</p>
          <p className="font-display text-[26px] tabular-nums">{value}<span className="text-smoke">/{ch.goal}</span></p>
        </div>
        <div className="mt-3">
          <CarriageProgress value={value} goal={ch.goal} color={ch.springColor} />
        </div>
        {(ch.startDate || ch.endDate) && (
          <p className="mt-3 text-[13px] text-smoke">
            {ch.startDate && fmtDate(ch.startDate)} — {ch.endDate && fmtDate(ch.endDate)}
          </p>
        )}
        <p className="mt-3 rounded-xl bg-plum-soft px-3 py-2.5 text-[14px] font-medium text-plum-deep">
          🎁 Reward: {ch.reward}
        </p>
        {progress?.completedAt && (
          <p className="mt-3 rounded-xl bg-spring-green/10 px-3 py-2.5 text-[14px] font-semibold text-spring-green">
            Completed on {fmtDate(progress.completedAt)} — reward waiting at reception.
          </p>
        )}
        {!progress && (
          <form
            action={async () => {
              "use server";
              await joinChallenge(ch.id);
            }}
            className="mt-4"
          >
            <button className="w-full rounded-xl bg-plum py-3 text-[15px] font-semibold text-white active:scale-[0.98]">
              Join this challenge
            </button>
          </form>
        )}
      </section>

      {board && (
        <section className="mt-6">
          <h2 className="font-display text-[22px]">Leaderboard</h2>
          <ol className="mt-3 space-y-2">
            {board.map((row, i) => (
              <li key={row.name} className={`flex items-center justify-between rounded-xl px-4 py-3 shadow-card ${row.name === member.name ? "bg-plum text-white" : "bg-card"}`}>
                <span className="text-[14px] font-semibold">
                  <span className="mr-2 inline-block w-5 text-center">{["🥇","🥈","🥉"][i] ?? i + 1}</span>
                  {row.name}
                </span>
                <span className="text-[14px] font-semibold tabular-nums">{row.value}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
