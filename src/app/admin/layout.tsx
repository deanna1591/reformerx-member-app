import Link from "next/link";
import { adminLogout } from "@/app/actions";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-ink p-5 text-white lg:flex">
        <p className="font-display text-lg tracking-[0.2em]">REFORMER X</p>
        <p className="mt-0.5 text-[12px] text-white/50">Studio dashboard</p>
        <nav className="mt-8 space-y-1 text-[14px]">
          {[
            ["/admin", "Overview"],
            ["/admin/challenges", "Challenges"],
            ["/admin/members", "Members"],
            ["/admin/redemptions", "Redemptions"],
            ["/admin/studio-qr", "Studio QR"],
            ["/admin/settings", "Settings"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="block rounded-lg px-3 py-2 font-medium text-white/70 transition hover:bg-white/10 hover:text-white">
              {label}
            </Link>
          ))}
        </nav>
        <form action={adminLogout} className="mt-auto">
          <button className="w-full rounded-lg border border-white/20 py-2 text-[13px] font-medium text-white/70 hover:text-white">Sign out</button>
        </form>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="border-b border-line bg-white px-6 py-3 text-[13px] text-smoke lg:hidden">
          The admin dashboard is designed for desktop. Open it on a larger screen for the full experience.
        </div>
        <main className="mx-auto max-w-5xl p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
