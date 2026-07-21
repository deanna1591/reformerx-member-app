"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Home", icon: "M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5" },
  { href: "/challenges", label: "Challenges", icon: "M8 21h8m-4-4v4M6 3h12v5a6 6 0 0 1-12 0V3Zm12 2h3a3 3 0 0 1-3 4M6 5H3a3 3 0 0 0 3 4" },
  { href: "/checkin", label: "", icon: "" },
  { href: "/rewards", label: "Rewards", icon: "M12 8v13m-8-9h16M4 8h16v4H4V8Zm4 0a3 3 0 1 1 4-3c0 1.5-1 3-4 3Zm8 0a3 3 0 1 0-4-3c0 1.5 1 3 4 3ZM5 12v9h14v-9" },
  { href: "/profile", label: "Profile", icon: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9a8 8 0 0 1 16 0" },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 mx-auto max-w-md">
      <div className="relative m-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-end justify-between rounded-2xl bg-ink px-2 pb-2 pt-2 text-white shadow-lift">
        {items.map((it) =>
          it.href === "/checkin" ? (
            <Link
              key={it.href}
              href="/checkin"
              aria-label="Check in"
              className="relative -mt-8 grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-plum text-white shadow-lift ring-4 ring-chalk transition active:scale-95"
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 3h6v6H3V3Zm12 0h6v6h-6V3ZM3 15h6v6H3v-6Zm12 3h3m3 0h-3m0 0v-3m0 3v3M12 3v4m0 4v2m-2 0h4" />
              </svg>
            </Link>
          ) : (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium transition ${
                pathname === it.href ? "text-white" : "text-white/50"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d={it.icon} />
              </svg>
              {it.label}
            </Link>
          )
        )}
      </div>
    </nav>
  );
}
