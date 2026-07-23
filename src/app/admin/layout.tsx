import Link from "next/link";
import { adminLogout, staffLogout } from "@/app/actions";
import { ensureDB } from "@/lib/store";
import { currentStaff, isOwner } from "@/lib/staff";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await ensureDB();
  const staff = currentStaff();
  const owner = isOwner();

  const items: Array<[string, string]> = [
    ["/admin", "Overview"],
    ["/admin/members", "Members"],
    ["/admin/redemptions", "Redemptions"],
    ["/admin/studio-qr", "Studio QR"],
  ];
  if (owner) {
    items.splice(1, 0, ["/admin/challenges", "Challenges"]);
    items.push(["/admin/promotions", "What’s on"], ["/admin/instructors", "Instructors"], ["/admin/settings", "Settings"]);
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-ink p-5 text-white lg:flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-white.png" alt="ReformerX" className="h-6 w-auto" />
        <p className="mt-0.5 text-[12px] text-white/50">Studio dashboard</p>

        {staff && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-white/10 p-2.5">
            {staff.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={staff.photoUrl} alt={staff.name} className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <div className="grid h-9 w-9 place-items-center rounded-full bg-sage text-ink font-display text-[15px]">
                {staff.name[0]}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold">{staff.name}</p>
              <p className="text-[11px] text-white/50">{owner ? "Owner" : "Instructor"}</p>
            </div>
          </div>
        )}

        <nav className="mt-6 space-y-1 text-[14px]">
          {items.map(([href, label]) => (
            <Link key={href} href={href} className="block rounded-lg px-3 py-2 font-medium text-white/70 transition hover:bg-white/10 hover:text-white">
              {label}
            </Link>
          ))}
        </nav>

        <form action={staff ? staffLogout : adminLogout} className="mt-auto">
          <button className="w-full rounded-lg border border-white/20 py-2 text-[13px] font-medium text-white/70 hover:text-white">
            Sign out
          </button>
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
