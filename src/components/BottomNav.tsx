"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Home", icon: "M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5" },
  { href: "/schedule", label: "Book", icon: "M8 2v3m8-3v3M3.5 9h17M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" },
  { href: "/checkin", label: "", icon: "" },
  { href: "/rewards", label: "Rewards", icon: "M12 8v13m-8-9h16M4 8h16v4H4V8Zm4 0a3 3 0 1 1 4-3c0 1.5-1 3-4 3Zm8 0a3 3 0 1 0-4-3c0 1.5 1 3 4 3ZM5 12v9h14v-9" },
  { href: "/profile", label: "Profile", icon: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9a8 8 0 0 1 16 0" },
];

export default function BottomNav({ labels }: { labels?: Record<string, string> }) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-around rounded-[26px] bg-ink px-2 py-2.5 shadow-lift">
        {items.map((item) => {
          const active = pathname === item.href;

          if (item.href === "/checkin") {
            return (
              <Link
                key={item.href}
                href="/checkin"
                aria-label="Check in"
                className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-sage text-ink shadow-lift transition active:scale-95"
              >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  <rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <path d="M14 14h3m0 0v3m0-3h4m-4 7h4m-7 0h1" />
                </svg>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[62px] flex-col items-center gap-1 rounded-2xl px-2 py-1.5 transition ${
                active ? "text-white" : "text-white/45"
              }`}
            >
              <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              <span className="text-[10.5px] font-semibold">{labels?.[item.href] ?? item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
