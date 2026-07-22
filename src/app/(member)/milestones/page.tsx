import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import { ensureDB } from "@/lib/store";
import { memberActivity, personalRecords } from "@/lib/engine";

export const dynamic = "force-dynamic";

const TIERS = [10, 25, 50, 100, 250, 500, 1000];

export default async function MilestonesPage() {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");

  const act = memberActivity(member.id);
  const records = personalRecords(member.id);
  const total = act.attended;

  const next = TIERS.find((t) => t > total);
  const prev = [...TIERS].reverse().find((t) => t <= total) ?? 0;
  const toGo = next ? next - total : 0;
  const pct = next ? Math.min(100, Math.round(((total - prev) / (next - prev)) * 100)) : 100;

  return (
    <div className="pb-28">
      <header className="rounded-b-[26px] bg-ink px-5 pb-6 pt-[max(1.2rem,env(safe-area-inset-top))] text-white">
        <h1 className="font-display text-[28px] uppercase tracking-wide">Milestones</h1>
        <p className="mt-0.5 text-[13px] text-white/60">Every carriage ride counts</p>

        <div className="mt-4 rounded-[22px] bg-white/10 p-5 text-center backdrop-blur">
          <p className="font-display text-[52px] leading-none tabular-nums">{total}</p>
          <p className="mt-1 text-[12px] uppercase tracking-wider text-white/60">Total classes</p>
          {next ? (
            <>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-sage" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2.5 text-[13px] text-white/75">
                <span className="font-semibold text-white">{toGo} to go</span> until Club {next}
              </p>
            </>
          ) : (
            <p className="mt-3 text-[13px] text-white/75">Every club unlocked. Legend status.</p>
          )}
        </div>
      </header>

      <div className="px-5 pt-5">
        <div className="grid grid-cols-4 gap-3">
          {TIERS.map((t) => {
            const earned = total >= t;
            return (
              <div key={t} className="flex flex-col items-center">
                <div
                  className={`grid h-16 w-16 place-items-center rounded-[18px] font-display text-[19px] ${
                    earned ? "bg-ink text-white" : "border border-line bg-white text-line"
                  }`}
                >
                  {t}
                </div>
                <p className={`mt-1.5 text-center text-[10px] uppercase tracking-wide ${earned ? "text-ink" : "text-smoke/60"}`}>
                  {t} classes
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl2 bg-card p-4 shadow-card">
            <p className="font-display text-[26px] leading-none tabular-nums">{records.longestStreak}</p>
            <p className="mt-1.5 text-[11px] uppercase tracking-wider text-smoke">Longest streak</p>
          </div>
          <div className="rounded-xl2 bg-card p-4 shadow-card">
            <p className="font-display text-[26px] leading-none tabular-nums">{records.bestMonth?.count ?? 0}</p>
            <p className="mt-1.5 text-[11px] uppercase tracking-wider text-smoke">Best month</p>
          </div>
          <div className="rounded-xl2 bg-card p-4 shadow-card">
            <p className="font-display text-[26px] leading-none tabular-nums">{act.challengesCompleted}</p>
            <p className="mt-1.5 text-[11px] uppercase tracking-wider text-smoke">Challenges won</p>
          </div>
          <div className="rounded-xl2 bg-card p-4 shadow-card">
            <p className="font-display text-[26px] leading-none tabular-nums">{act.rewardsEarned}</p>
            <p className="mt-1.5 text-[11px] uppercase tracking-wider text-smoke">Rewards earned</p>
          </div>
        </div>

        {next && (
          <div className="mt-4 rounded-xl2 bg-sage-soft p-5 text-center">
            <p className="font-display text-[18px]">Club {next} is close</p>
            <p className="mt-1 text-[13px] text-smoke">
              {toGo} more {toGo === 1 ? "class" : "classes"} and there&apos;s something waiting at reception.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
