import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import { getDB, ensureDB } from "@/lib/store";
import { fmtDate, membershipActive, passUsage } from "@/lib/engine";
import { simplybookPackagesUrl } from "@/lib/simplybook";

export const dynamic = "force-dynamic";

export default async function StorePage() {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");
  const db = getDB();
  const active = membershipActive(member);
  const pass = passUsage(member.id);
  const shopUrl = simplybookPackagesUrl();

  const packages = (db.packages ?? []).filter((p) => p.price > 0);
  const daysLeft = active
    ? Math.max(0, Math.ceil((new Date(member.membershipExpires).getTime() - Date.now()) / 86400000))
    : 0;

  const price = (n: number, c: string) =>
    new Intl.NumberFormat("cs-CZ", { style: "currency", currency: c || "CZK", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="pb-28">
      <header className="rounded-b-[26px] bg-ink px-5 pb-6 pt-[max(1.2rem,env(safe-area-inset-top))] text-white">
        <h1 className="font-display text-[28px] uppercase tracking-wide">Passes</h1>
        <p className="mt-0.5 text-[13px] text-white/60">Memberships & class packs</p>

        <div className="mt-4 rounded-[22px] bg-white/10 p-4 backdrop-blur">
          <p className="text-[11px] uppercase tracking-wider text-white/55">Your membership</p>
          <p className="mt-1 font-display text-[24px] leading-none">
            {active ? pass?.name ?? member.membershipType : "No active pass"}
          </p>
          <p className="mt-1.5 text-[13px] text-white/70">
            {active
              ? `Valid until ${fmtDate(member.membershipExpires)} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
              : "Buy a pass to book classes and earn rewards."}
          </p>
          {active && pass && <p className="mt-1 text-[13px] font-medium text-sage">{pass.summary}</p>}
        </div>
      </header>

      <div className="space-y-3 px-5 pt-5">
        {packages.map((p) => (
          <a
            key={p.id}
            href={shopUrl}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl2 bg-card p-5 shadow-card transition active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-[19px] leading-tight">{p.name}</p>
                <p className="mt-1 text-[12px] text-smoke">
                  {p.validityDays ? `Valid ${p.validityDays} days` : "Studio pass"}
                  {p.classes ? ` · ${p.classes} classes` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-[19px] leading-tight tabular-nums">{price(p.price, p.currency)}</p>
                <p className="mt-1 text-[12px] font-semibold text-tan-deep">Buy ↗</p>
              </div>
            </div>
          </a>
        ))}

        {packages.length === 0 && (
          <div className="rounded-xl2 bg-card p-6 text-center shadow-card">
            <p className="font-display text-[20px]">Passes load after a sync</p>
            <p className="mt-1 text-[13px] text-smoke">
              Your studio&apos;s pass list is read from SimplyBook purchase history.
            </p>
          </div>
        )}

        <a
          href={shopUrl}
          target="_blank"
          rel="noreferrer"
          className="block rounded-xl2 bg-ink p-5 text-center text-white shadow-card"
        >
          <p className="font-display text-[18px] uppercase tracking-wide">Open the ReformerX shop</p>
          <p className="mt-1 text-[12px] text-white/60">Secure checkout · your pass activates instantly</p>
        </a>

        <p className="px-1 pt-1 text-center text-[11px] leading-relaxed text-smoke">
          Payments are processed by ReformerX&apos;s existing checkout. Your new pass appears here
          automatically once the payment is confirmed.
        </p>
      </div>
    </div>
  );
}
