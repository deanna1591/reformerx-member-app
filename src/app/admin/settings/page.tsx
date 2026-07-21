import { getDB } from "@/lib/store";
import { toggleLeaderboards } from "@/app/actions";

export const dynamic = "force-dynamic";

export default function AdminSettings() {
  const db = getDB();
  return (
    <div>
      <h1 className="font-display text-[32px]">Settings</h1>
      <div className="mt-6 max-w-xl space-y-4">
        <div className="flex items-center justify-between rounded-xl2 bg-white p-5 shadow-card">
          <div>
            <p className="text-[15px] font-semibold">Public leaderboards</p>
            <p className="text-[13px] text-smoke">Some studios prefer to keep rankings private. Turning this off hides all leaderboards in the member app.</p>
          </div>
          <form action={toggleLeaderboards}>
            <button className={`h-8 w-14 rounded-full p-1 transition ${db.settings.leaderboardsEnabled ? "bg-spring-green" : "bg-line"}`} aria-label="Toggle leaderboards">
              <span className={`block h-6 w-6 rounded-full bg-white shadow transition ${db.settings.leaderboardsEnabled ? "translate-x-6" : ""}`} />
            </button>
          </form>
        </div>
        <div className="rounded-xl2 bg-white p-5 shadow-card">
          <p className="text-[15px] font-semibold">Integrations</p>
          <ul className="mt-2 space-y-1.5 text-[13px] text-smoke">
            <li>• SimplyBook — membership & payment sync (API keys via env, see docs)</li>
            <li>• WordPress booking — bookings imported via REST API during Phase 1</li>
            <li>• Firebase Cloud Messaging — production push notifications</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
