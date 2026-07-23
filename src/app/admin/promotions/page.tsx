import { getDB, ensureDB } from "@/lib/store";
import { getT } from "@/lib/i18n";
import { savePromotion, deletePromotion, movePromotion } from "@/app/actions";
import { fmtDate } from "@/lib/engine";
import ConfirmButton from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

export default async function PromotionsPage({ searchParams }: { searchParams: { edit?: string; saved?: string } }) {
  await ensureDB();
  const db = getDB();
  const t = getT();
  const promos = (db.promotions ?? []).sort((a, b) => a.order - b.order);
  const editing = searchParams.edit ? promos.find((p) => p.id === searchParams.edit) : undefined;
  const dateInput = (iso?: string) => (iso ? iso.slice(0, 10) : "");

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-[32px]">{t("adm.promotions")}</h1>
      <p className="mt-1 text-[13px] text-smoke">
        {t("adm.p.lead")}
      </p>

      {searchParams.saved && (
        <div className="mt-4 rounded-xl border border-spring-green/40 bg-spring-green/10 px-4 py-3 text-[13px]">{t("adm.saved")}</div>
      )}

      <section className="mt-5 rounded-xl2 bg-white p-5 shadow-card">
        <h2 className="font-display text-[20px]">{editing ? `${t("adm.edit")} — ${editing.title}` : t("adm.p.add")}</h2>
        <form action={savePromotion} className="mt-4 grid gap-4 sm:grid-cols-2" encType="multipart/form-data">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div>
            <label htmlFor="title">{t("adm.p.title")}</label>
            <input id="title" name="title" required defaultValue={editing?.title} className="mt-1.5" placeholder="Summer Kids Camp" />
          </div>
          <div>
            <label htmlFor="subtitle">{t("adm.p.subtitle")}</label>
            <input id="subtitle" name="subtitle" defaultValue={editing?.subtitle} className="mt-1.5" placeholder="Ages 6–12 · Haštalská" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="body">{t("adm.p.description")}</label>
            <textarea
              id="body"
              name="body"
              rows={2}
              defaultValue={editing?.body}
              className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-[14px]"
              placeholder={t("adm.p.descPlaceholder")}
            />
          </div>
          <div>
            <label htmlFor="image">{t("adm.p.image")}</label>
            <input id="image" name="image" type="file" accept="image/*" className="mt-1.5 text-[13px]" />
            <p className="mt-1 text-[11px] text-smoke">{t("adm.p.imageHint")}</p>
          </div>
          <div>
            <label htmlFor="imageUrl">{t("adm.f.orImageUrl")}</label>
            <input id="imageUrl" name="imageUrl" defaultValue={editing?.imageUrl?.startsWith("http") ? editing.imageUrl : ""} className="mt-1.5" placeholder="https://…" />
          </div>
          <div>
            <label htmlFor="linkUrl">{t("adm.p.link")}</label>
            <input id="linkUrl" name="linkUrl" defaultValue={editing?.linkUrl} className="mt-1.5" placeholder="https://reformerx.cz/kids-camp" />
          </div>
          <div>
            <label htmlFor="linkLabel">{t("adm.p.linkLabel")}</label>
            <input id="linkLabel" name="linkLabel" defaultValue={editing?.linkLabel} className="mt-1.5" placeholder="Find out more" />
          </div>
          <div>
            <label htmlFor="badge">{t("adm.p.badge")}</label>
            <input id="badge" name="badge" defaultValue={editing?.badge} className="mt-1.5" placeholder="AUGUST 2026" />
          </div>
          <div>
            <label htmlFor="order">{t("adm.p.order")}</label>
            <input id="order" name="order" type="number" defaultValue={editing?.order ?? promos.length} className="mt-1.5" />
          </div>
          <div>
            <label htmlFor="startsAt">{t("adm.p.showFrom")} <span className="font-normal text-smoke">({t("adm.p.optional")})</span></label>
            <input id="startsAt" name="startsAt" type="date" defaultValue={dateInput(editing?.startsAt)} className="mt-1.5" />
          </div>
          <div>
            <label htmlFor="endsAt">{t("adm.p.hideAfter")} <span className="font-normal text-smoke">({t("adm.p.optional")})</span></label>
            <input id="endsAt" name="endsAt" type="date" defaultValue={dateInput(editing?.endsAt)} className="mt-1.5" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" name="active" defaultChecked={editing ? editing.active : true} className="h-4 w-4" />
              {t("adm.p.visible")}
            </label>
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <button className="rounded-xl bg-ink px-5 py-2.5 text-[14px] font-semibold text-white">
              {editing ? t("adm.saveChanges") : t("adm.p.add")}
            </button>
            {editing && (
              <a href="/admin/promotions" className="rounded-xl border border-line bg-white px-5 py-2.5 text-[14px] font-semibold">
                {t("adm.cancel")}
              </a>
            )}
          </div>
        </form>
      </section>

      <section className="mt-6 space-y-2">
        {promos.map((p, i) => {
          const hidden =
            !p.active ||
            (p.startsAt && new Date(p.startsAt).getTime() > Date.now()) ||
            (p.endsAt && new Date(p.endsAt).getTime() < Date.now());
          return (
            <div key={p.id} className="flex items-center gap-4 rounded-xl2 bg-white p-4 shadow-card">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="h-16 w-24 shrink-0 rounded-lg bg-gradient-to-br from-sage to-tan" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {p.title}
                  {hidden && <span className="ml-2 text-[11px] font-semibold uppercase text-smoke">{t("adm.f.hidden")}</span>}
                </p>
                {p.subtitle && <p className="text-[12px] text-smoke">{p.subtitle}</p>}
                <p className="mt-1 text-[11px] text-smoke">
                  {p.startsAt || p.endsAt
                    ? `${p.startsAt ? fmtDate(p.startsAt) : "always"} → ${p.endsAt ? fmtDate(p.endsAt) : "no end"}`
                    : t("adm.p.alwaysVisible")}
                  {p.linkUrl ? ` · ${t("adm.p.hasLink")}` : ` · ${t("adm.p.noLink")}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <form action={movePromotion}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="dir" value="up" />
                  <button disabled={i === 0} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] disabled:opacity-30">↑</button>
                </form>
                <form action={movePromotion}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="dir" value="down" />
                  <button disabled={i === promos.length - 1} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] disabled:opacity-30">↓</button>
                </form>
                <a href={`/admin/promotions?edit=${p.id}`} className="rounded-xl border border-line bg-white px-3 py-1.5 text-[12px] font-semibold">{t("adm.edit")}</a>
                <form action={deletePromotion}>
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmButton
                    message={t("adm.p.deleteConfirm", { title: p.title })}
                    className="rounded-xl border border-line bg-white px-3 py-1.5 text-[12px] font-semibold text-spring-red"
                  >
                    {t("adm.delete")}
                  </ConfirmButton>
                </form>
              </div>
            </div>
          );
        })}
        {promos.length === 0 && (
          <div className="rounded-xl2 bg-white p-8 text-center text-[14px] text-smoke shadow-card">
            {t("adm.p.empty")}
          </div>
        )}
      </section>
    </div>
  );
}
