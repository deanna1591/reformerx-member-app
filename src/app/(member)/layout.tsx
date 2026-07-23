import BottomNav from "@/components/BottomNav";
import InstallPrompt from "@/components/InstallPrompt";
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
      <InstallPrompt
        labels={{
          title: t("install.title"),
          body: t("install.body"),
          install: t("install.install"),
          later: t("install.later"),
          iosTitle: t("install.iosTitle"),
          iosStep1: t("install.iosStep1"),
          iosStep2: t("install.iosStep2"),
        }}
      />
    </div>
  );
}
