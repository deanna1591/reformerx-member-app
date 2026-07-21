import { getDB } from "@/lib/store";
import { createChallenge, toggleChallenge } from "@/app/actions";
import { fmtDate } from "@/lib/engine";

export const dynamic = "force-dynamic";

export default function AdminChallenges() {
  const db = getDB();
  return (
    <div>
      <h1 className="font-display text-[32px]">Challenges</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <section className="space-y-3">
          {db.challenges.map((ch) => (
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
                </div>
                <form action={async () => { "use server"; await toggleChallenge(ch.id); }}>
                  <button className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${ch.active ? "bg-spring-green/15 text-spring-green" : "bg-line text-smoke"}`}>
                    {ch.active ? "Active" : "Paused"}
                  </button>
                </form>
              </div>
            </div>
          ))}
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
