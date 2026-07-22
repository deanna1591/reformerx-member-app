import Link from "next/link";
import { redirect } from "next/navigation";
import { currentMember } from "@/lib/auth";
import { ensureDB } from "@/lib/store";
import { fmtDate, membershipActive, passUsage } from "@/lib/engine";
import { memberLogout } from "@/app/actions";
import PushOptIn from "@/components/PushOptIn";
import ShareButton from "@/components/ShareButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await ensureDB();
  const member = currentMember();
  if (!member) redirect("/login");
  const active = membershipActive(member);
  const pass = passUsage(member.id);

  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5 last:border-0">
      <span className="text-[13px] text-smoke">{label}</span>
      <span className="truncate text-right text-[14px] font-medium">{value}</span>
    </div>
  );

  const link = (href: string, label: string, hint?: string) => (
    <Link href={href} className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 last:border-0">
      <span>
        <span className="block text-[14px] font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-[12px] text-smoke">{hint}</span>}
      </span>
      <span className="text-smoke">›</span>
    </Link>
  );

  return (
    <div className="pb-28">
      <header className="rounded-b-[26px] bg-ink px-5 pb-6 pt-[max(1.2rem,env(safe-area-inset-top))] text-white">
        <h1 className="font-display text-[28px] uppercase tracking-wide">Settings</h1>
        <p className="mt-0.5 text-[13px] text-white/60">{member.name}</p>
      </header>

      <div className="space-y-4 px-5 pt-5">
        <section className="overflow-hidden rounded-xl2 bg-card shadow-card">
          <p className="px-5 pb-1 pt-4 text-[11px] uppercase tracking-wider text-smoke">Account</p>
          {row("Name", member.name)}
          {row("Email", member.email)}
          {row("Member code", member.qrCode)}
          {row("Member since", fmtDate(member.joinedAt))}
        </section>

        <section className="overflow-hidden rounded-xl2 bg-card shadow-card">
          <p className="px-5 pb-1 pt-4 text-[11px] uppercase tracking-wider text-smoke">Membership</p>
          {row("Pass", active ? pass?.name ?? member.membershipType : "No active pass")}
          {row("Valid until", active ? fmtDate(member.membershipExpires) : "—")}
          {active && pass && row("Usage", pass.summary)}
          {link("/store", "Buy or renew a pass", "Opens the ReformerX shop")}
        </section>

        <section className="overflow-hidden rounded-xl2 bg-card shadow-card">
          <p className="px-5 pb-1 pt-4 text-[11px] uppercase tracking-wider text-smoke">Notifications</p>
          <div className="px-5 py-4">
            <PushOptIn />
            <p className="mt-2 text-[12px] text-smoke">
              Class reminders, challenge milestones, and reward pickups.
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl2 bg-card shadow-card">
          <p className="px-5 pb-1 pt-4 text-[11px] uppercase tracking-wider text-smoke">More</p>
          {link("/milestones", "Milestones", "Your class clubs and records")}
          {link("/challenges", "Challenges", "Active studio challenges")}
          {link("/rewards", "Rewards", "Earned and collected")}
          <div className="px-5 py-4">
            <ShareButton
              label="Invite a friend"
              text={`Join me at ReformerX — use my member code ${member.qrCode} when you sign up.`}
            />
          </div>
        </section>

        <form action={memberLogout}>
          <button className="w-full rounded-xl2 bg-white py-4 text-[14px] font-semibold text-spring-red shadow-card">
            Sign out
          </button>
        </form>

        <p className="pb-2 pt-1 text-center text-[11px] text-smoke">ReformerX · Haštalská, Prague 1</p>
      </div>
    </div>
  );
}
