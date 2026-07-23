import { getDB, ensureDB } from "@/lib/store";
import { getT } from "@/lib/i18n";
import { createChallenge, toggleChallenge, deleteChallenge, addStarterChallenges } from "@/app/actions";
import ConfirmButton from "@/components/ConfirmButton";
import { fmtDate } from "@/lib/engine";

export const dynamic = "force-dynamic";

export default async function AdminChallenges() {
  await ensureDB();
  const db = getDB();
  const t = getT();
  return (
    <div>
      <h1 className="font-display text-[32px]">{t("adm.c.title")}</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <section className="space-y-3">
          {db.challenges.map((ch) => {
            const joined = db.challengeProgress.filter((p) => p.challengeId === ch.id).length;
            const completed = db.challengeProgress.filter((p) => p.challengeId === ch.id && p.completedAt).length;
            return (
            <div key={ch.id} className="rounded-xl2 bg-white p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[16px] font-semibold">{ch.emoji} {ch.name}</p>
                  <p className="mt-1 text-[13px] text-smoke">{ch.description}</p>
                  <p className="mt-2 text-[13px]">
                    <span className="font-medium">Goal:</span> {ch.goal} · <span className="font-medium">Reward:</span> {ch.reward}
                    {ch.startDate && <> · {fmtDate(ch.startDate)} — {ch.endDate ? fmtDate(ch.endDate) : "open"}</>}
                    {ch.leaderboard && " · 🏆 leaderboard"}
                  </p>
                  <p className="mt-1 text-[12px] text-smoke">
                    {t("adm.c.joinedCount", { n: joined })}
                    {completed > 0 && ` · ${t("adm.c.completedCount", { n: completed })}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <form action={async () => { "use server"; await toggleChallenge(ch.id); }}>
                    <button className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${ch.active ? "bg-spring-green/15 text-spring-green" : "bg-line text-smoke"}`}>
                      {ch.active ? t("adm.c.active") : t("adm.c.paused")}
                    </button>
                  </form>
                  {joined === 0 && (
                    <form action={deleteChallenge}>
                      <input type="hidden" name="challengeId" value={ch.id} />
                      <ConfirmButton
                        message={t("adm.c.deleteConfirm", { name: ch.name })}
                        className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-spring-red"
                      >
                        {t("adm.c.delete")}
                      </ConfirmButton>
                    </form>
                  )}
                  {joined > 0 && <span className="px-1 text-[11px] text-smoke">{t("adm.c.cannotDelete")}</span>}
                </div>
              </div>
            </div>
            );
          })}

          {db.challenges.length === 0 && (
            <div className="rounded-xl2 bg-white p-8 text-center shadow-card">
              <p className="font-display text-[20px]">{t("adm.c.emptyTitle")}</p>
              <p className="mt-1 text-[13px] text-smoke">{t("adm.c.emptyBody")}</p>
            </div>
          )}

          <form action={addStarterChallenges}>
            <button className="w-full rounded-xl2 border border-dashed border-line bg-white py-4 text-[13px] font-semibold text-tan-deep">
              {t("adm.c.addStarters")}
            </button>
          </form>
        </section>

        <section className="h-fit rounded-xl2 bg-white p-6 shadow-card">
          <h2 className="font-display text-[20px]">Create challenge</h2>
          <p className="mt-1 text-[12px] text-smoke">No coding needed. Members are notified instantly.</p>
          <form action={createChallenge} className="mt-4 space-y-3">
            <div className="grid grid-cols-[64px_1fr] gap-2">
              <div>
                <label>Emoji</label>
                <input name="emoji" placeholder="🏆" className="mt-1 text-center" />
              </div>
              <div>
                <label>Name</label>
                <input name="name" required placeholder="15 classes before Aug 31" className="mt-1" />
              </div>
            </div>
            <div>
              <label>Description</label>
              <textarea name="description" rows={2} placeholder="What members need to do…" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label>Type</label>
                <select name="type" className="mt-1">
                  <option value="class_count">Classes in a period</option>
                  <option value="streak_days">Consecutive days</option>
                  <option value="instructor_variety">Different instructors</option>
                  <option value="lifetime_count">Lifetime classes</option>
                  <option value="monthly_count">Classes per calendar month (resets)</option>
                  <option value="referrals">Friends referred (first class taken)</option>
                </select>
              </div>
              <div>
                <label>Goal</label>
                <input name="goal" type="number" min="1" defaultValue="10" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label>Start date</label>
                <input name="startDate" type="date" className="mt-1" />
              </div>
              <div>
                <label>End date</label>
                <input name="endDate" type="date" className="mt-1" />
              </div>
            </div>
            <div>
              <label>Reward</label>
              <input name="reward" placeholder="Free tote bag" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 items-end gap-2">
              <div>
                <label>Spring colour</label>
                <select name="springColor" className="mt-1">
                  <option value="red">Red — heavy</option>
                  <option value="blue">Blue — medium</option>
                  <option value="yellow">Yellow — light</option>
                  <option value="green">Green — endurance</option>
                </select>
              </div>
              <label className="flex items-center gap-2 pb-2.5 text-[13px] font-medium text-ink">
                <input type="checkbox" name="leaderboard" className="h-4 w-4 accent-ink" style={{ width: "1rem" }} />
                Leaderboard
              </label>
            </div>
            <button className="w-full rounded-xl bg-ink py-3 text-[14px] font-semibold text-white">Publish challenge</button>
          </form>
        </section>
      </div>
    </div>
  );
}
