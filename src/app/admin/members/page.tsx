import Link from "next/link";
import { getDB, ensureDB } from "@/lib/store";
import { fmtDate, membershipActive, memberStats } from "@/lib/engine";
import { simulateSimplybookSync } from "@/app/actions";
import SyncButton from "@/components/SyncButton";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PER_PAGE = 25;
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

type Status = "all" | "active" | "expired" | "none";

export default async function AdminMembers({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; type?: string; page?: string };
}) {
  await ensureDB();
  const db = getDB();
  const q = (searchParams.q ?? "").trim();
  const status = (["all", "active", "expired", "none"].includes(searchParams.status ?? "")
    ? searchParams.status
    : "all") as Status;
  const type = searchParams.type ?? "all";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const statusOf = (m: (typeof db.members)[number]): Status => {
    if (membershipActive(m)) return "active";
    if (new Date(m.membershipExpires).getTime() < new Date("2000-01-01").getTime()) return "none";
    return "expired";
  };

  const all = db.members;
  const counts = { all: all.length, active: 0, expired: 0, none: 0 };
  for (const m of all) counts[statusOf(m)]++;

  const types = Array.from(new Set(all.map((m) => m.membershipType))).sort();

  let list = all;
  if (q) {
    const nq = norm(q);
    list = list.filter((m) => norm(m.name).includes(nq) || norm(m.email).includes(nq) || m.qrCode.toLowerCase().includes(nq.toLowerCase()));
  }
  if (status !== "all") list = list.filter((m) => statusOf(m) === status);
  if (type !== "all") list = list.filter((m) => m.membershipType === type);

  // Active first, then by soonest expiry; inactive by name
  list = [...list].sort((a, b) => {
    const sa = statusOf(a) === "active" ? 0 : 1;
    const sb = statusOf(b) === "active" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    if (sa === 0) return +new Date(a.membershipExpires) - +new Date(b.membershipExpires);
    return a.name.localeCompare(b.name);
  });

  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const current = Math.min(page, pages);
  const slice = list.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  const href = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q, status, type, page: current, ...over };
    if (merged.q) p.set("q", String(merged.q));
    if (merged.status && merged.status !== "all") p.set("status", String(merged.status));
    if (merged.type && merged.type !== "all") p.set("type", String(merged.type));
    if (merged.page && Number(merged.page) > 1) p.set("page", String(merged.page));
    const qs = p.toString();
    return `/admin/members${qs ? `?${qs}` : ""}`;
  };

  const chip = (s: Status, label: string) => (
    <Link
      href={href({ status: s, page: 1 })}
      className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
        status === s ? "bg-ink text-white" : "border border-line bg-white text-smoke hover:border-ink"
      }`}
    >
      {label} <span className="tabular-nums opacity-70">{counts[s]}</span>
    </Link>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[32px]">Members</h1>
        <form action={simulateSimplybookSync}>
          <SyncButton />
        </form>
      </div>
      <p className="mt-1 text-[13px] text-smoke">
        Memberships are read from SimplyBook. Active = booked within the last 45 days or upcoming.
      </p>

      {db.settings.lastSync && (() => {
        const [at, st, ...rest] = db.settings.lastSync!.split("|");
        const msg = rest.join("|");
        const tone =
          st === "ok" ? "border-spring-green/40 bg-spring-green/10 text-ink"
          : st === "err" ? "border-spring-red/40 bg-spring-red/10 text-ink"
          : "border-line bg-white text-smoke";
        return (
          <div className={`mt-3 rounded-xl border px-4 py-3 text-[13px] ${tone}`}>
            <span className="font-semibold">Last sync</span> · {new Date(at).toLocaleString()} — {msg}
          </div>
        );
      })()}

      {/* Search + filters */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <form className="flex min-w-[260px] flex-1 gap-2" action="/admin/members" method="GET">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          {type !== "all" && <input type="hidden" name="type" value={type} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, email, or member code…"
            className="!mt-0 flex-1"
          />
          <button className="rounded-xl border border-line bg-white px-4 text-[13px] font-semibold">Search</button>
          {q && (
            <Link href={href({ q: "", page: 1 })} className="grid place-items-center rounded-xl border border-line bg-white px-3 text-[13px] font-semibold text-smoke">
              ✕
            </Link>
          )}
        </form>
        <div className="flex flex-wrap gap-2">
          {chip("all", "All")}
          {chip("active", "Active")}
          {chip("expired", "Expired")}
          {chip("none", "No membership")}
        </div>
        <form action="/admin/members" method="GET" className="ml-auto">
          {q && <input type="hidden" name="q" value={q} />}
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <select
            name="type"
            defaultValue={type}
            className="rounded-xl border border-line bg-white px-3 py-2 text-[13px] font-semibold"
          >
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button className="ml-2 rounded-xl border border-line bg-white px-3 py-2 text-[13px] font-semibold">Filter</button>
        </form>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl2 bg-white shadow-card">
        <table className="w-full text-left text-[14px]">
          <thead className="border-b border-line text-[12px] uppercase tracking-wider text-smoke">
            <tr>
              <th className="px-5 py-3">Member</th>
              <th className="px-5 py-3">Membership</th>
              <th className="px-5 py-3">Expires</th>
              <th className="px-5 py-3">Classes</th>
              <th className="px-5 py-3">Rewards</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {slice.map((m) => {
              const st = statusOf(m);
              const stats = memberStats(m.id);
              return (
                <tr key={m.id} className="transition hover:bg-chalk/60">
                  <td className="px-5 py-3">
                    <Link href={`/admin/members/${m.id}`} className="block">
                      <p className="font-medium">{m.name}</p>
                      <p className="text-[12px] text-smoke">{m.email}</p>
                    </Link>
                  </td>
                  <td className="px-5 py-3">{m.membershipType}</td>
                  <td className="px-5 py-3 tabular-nums">{st === "none" ? "—" : fmtDate(m.membershipExpires)}</td>
                  <td className="px-5 py-3 tabular-nums">{stats.total}</td>
                  <td className="px-5 py-3 tabular-nums">{stats.rewardsCollected}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${
                      st === "active" ? "bg-spring-green/15 text-spring-green" : st === "none" ? "bg-chalk text-smoke" : "bg-spring-red/15 text-spring-red"
                    }`}>
                      {st === "active" ? "Active" : st === "none" ? "No membership" : "Expired"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/members/${m.id}`} className="text-[13px] font-semibold text-tan-deep">
                      Manage →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {slice.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-[14px] text-smoke">No members match. Clear the search or filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-[13px]">
        <p className="text-smoke">
          {list.length} member{list.length === 1 ? "" : "s"} · page {current} of {pages}
        </p>
        <div className="flex gap-2">
          {current > 1 && (
            <Link href={href({ page: current - 1 })} className="rounded-xl border border-line bg-white px-4 py-2 font-semibold">← Prev</Link>
          )}
          {current < pages && (
            <Link href={href({ page: current + 1 })} className="rounded-xl border border-line bg-white px-4 py-2 font-semibold">Next →</Link>
          )}
        </div>
      </div>
    </div>
  );
}
