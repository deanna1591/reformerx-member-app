import { getT } from "@/lib/i18n";
import { ensureDB, getDB } from "@/lib/store";
import { BUILTIN_BADGE_IDS } from "@/lib/badges";
import { saveBadge, deleteBadge } from "@/app/actions";
import BadgeUpload from "@/components/BadgeUpload";

export const dynamic = "force-dynamic";

export default async function AdminBadges() {
  await ensureDB();
  const db = getDB();
  const t = getT();

  const holders = (id: string) => db.earnedBadges.filter((b) => b.badgeId === id).length;
  const builtins = db.badgeDefs.filter((b) => BUILTIN_BADGE_IDS.has(b.id));
  const custom = db.badgeDefs.filter((b) => !BUILTIN_BADGE_IDS.has(b.id));

  const card = (b: (typeof db.badgeDefs)[number], isBuiltin: boolean) => (
    <div key={b.id} className="flex items-center gap-3 rounded-xl2 bg-card p-4 shadow-card">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sage-soft">
        {b.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.imageUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <span className="text-[22px] leading-none">{b.emoji}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{b.name}</p>
        <p className="truncate text-[12px] text-smoke">{b.description}</p>
        <p className="mt-0.5 text-[11px] text-smoke">
          {t("adm.badgeHolders", { n: holders(b.id) })}
          {!isBuiltin && typeof b.classesRequired === "number" ? ` · ${b.classesRequired}` : ""}
        </p>
      </div>
      {isBuiltin ? (
        <span className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] text-smoke">
          {t("adm.badgeBuiltin")}
        </span>
      ) : (
        <form action={deleteBadge}>
          <input type="hidden" name="badgeId" value={b.id} />
          <button className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] text-smoke">
            {t("adm.badgeDelete")}
          </button>
        </form>
      )}
    </div>
  );

  return (
    <main className="px-5 py-6">
      <h1 className="font-display text-[26px] uppercase tracking-wide">{t("adm.badges")}</h1>

      <section className="mt-5 space-y-2">{builtins.map((b) => card(b, true))}</section>

      {custom.length > 0 && (
        <section className="mt-5 space-y-2">{custom.map((b) => card(b, false))}</section>
      )}

      <section className="mt-6 rounded-xl2 bg-card p-5 shadow-card">
        <h2 className="font-display text-[18px]">{t("adm.badgeNew")}</h2>
        <BadgeUpload
          action={saveBadge}
          labels={{
            name: t("adm.badgeName"),
            description: t("adm.badgeDesc"),
            classes: t("adm.badgeClasses"),
            image: t("adm.badgeImage"),
            save: t("adm.badgeSave"),
          }}
        />
      </section>
    </main>
  );
}
