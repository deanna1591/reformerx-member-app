import BottomNav from "@/components/BottomNav";
import { getT } from "@/lib/i18n";

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  const t = getT();
  return (
    <div className="mx-auto min-h-dvh max-w-md pb-32">
      {children}
      <BottomNav
        labels={{
          "/": t("nav.home"),
          "/schedule": t("nav.book"),
          "/rewards": t("nav.rewards"),
          "/profile": t("nav.profile"),
        }}
      />
    </div>
  );
}
