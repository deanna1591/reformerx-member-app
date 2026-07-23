import { getDB, ensureDB } from "@/lib/store";
import { savePromotion, deletePromotion, movePromotion } from "@/app/actions";
import { fmtDate } from "@/lib/engine";
import ConfirmButton from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

export default async function PromotionsPage({ searchParams }: { searchParams: { edit?: string; saved?: string } }) {
  await ensureDB();
  const db = getDB();
  const promos = (db.promotions ?? []).sort((a, b) => a.order - b.order);
  const editing = searchParams.edit ? promos.find((p) => p.id === searchParams.edit) : undefined;
  const dateInput = (iso?: string) => (iso ? iso.slice(0, 10) : "");

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-[32px]">What&apos;s on</h1>
      <p className="mt-1 text-[13px] text-smoke">
        Promotions, camps, retreats and events. These appear as a swipeable carousel on the member home screen,
        below their challenges.
      </p>

      {searchParams.saved && (
        <div className="mt-4 rounded-xl border border-spring-green/40 bg-spring-green/10 px-4 py-3 text-[13px]">Saved.</div>
      )}

      <section className="mt-5 rounded-xl2 bg-white p-5 shadow-card">
        <h2 className="font-display text-[20px]">{editing ? `Edit “${editing.title}”` : "Add a promotion"}</h2>
        <form action={savePromotion} className="mt-4 grid gap-4 sm:grid-cols-2" encType="multipart/form-data">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div>
            <label htmlFor="title">Title</label>
            <input id="title" name="title" required defaultValue={editing?.title} className="mt-1.5" placeholder="Summer Kids Camp" />
          </div>
          <div>
            <label htmlFor="subtitle">Subtitle</label>
            <input id="subtitle" name="subtitle" defaultValue={editing?.subtitle} className="mt-1.5" placeholder="Ages 6–12 · Haštalská" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="body">Short description</label>
            <textarea
              id="body"
              name="body"
              rows={2}
              defaultValue={editing?.body}
              className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-[14px]"
              placeholder="One or two lines — members see the first two on the card."
            />
          </div>
          <div>
            <label htmlFor="image">Image</label>
            <input id="image" name="image" type="file" accept="image/*" className="mt-1.5 text-[13px]" />
            <p className="mt-1 text-[11px] text-smoke">Landscape works best (about 3:2). Up to ~1.2 MB.</p>
          </div>
          <div>
            <label htmlFor="imageUrl">…or image URL</label>
            <input id="imageUrl" name="imageUrl" defaultValue={editing?.imageUrl?.startsWith("http") ? editing.imageUrl : ""} className="mt-1.5" placeholder="https://…" />
          </div>
          <div>
            <label htmlFor="linkUrl">Link (more info / booking)</label>
            <input id="linkUrl" name="linkUrl" defaultValue={editing?.linkUrl} className="mt-1.5" placeholder="https://reformerx.cz/kids-camp" />
          </div>
          <div>
            <label htmlFor="linkLabel">Link label</label>
            <input id="linkLabel" name="linkLabel" defaultValue={editing?.linkLabel} className="mt-1.5" placeholder="Find out more" />
          </div>
          <div>
            <label htmlFor="badge">Badge</label>
            <input id="badge" name="badge" defaultValue={editing?.badge} className="mt-1.5" placeholder="AUGUST 2026" />
          </div>
          <div>
            <label htmlFor="order">Order</label>
            <input id="order" name="order" type="number" defaultValue={editing?.order ?? promos.length} className="mt-1.5" />
          </div>
          <div>
            <label htmlFor="startsAt">Show from <span className="font-normal text-smoke">(optional)</span></label>
            <input id="startsAt" name="startsAt" type="date" defaultValue={dateInput(editing?.startsAt)} className="mt-1.5" />
          </div>
          <div>
            <label htmlFor="endsAt">Hide after <span className="font-normal text-smoke">(optional)</span></label>
            <input id="endsAt" name="endsAt" type="date" defaultValue={dateInput(editing?.endsAt)} className="mt-1.5" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" name="active" defaultChecked={editing ? editing.active : true} className="h-4 w-4" />
              Visible to members
            </label>
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <button className="rounded-xl bg-ink px-5 py-2.5 text-[14px] font-semibold text-white">
              {editing ? "Save changes" : "Add promotion"}
            </button>
            {editing && (
              <a href="/admin/promotions" className="rounded-xl border border-line bg-white px-5 py-2.5 text-[14px] font-semibold">
                Cancel
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
                  {hidden && <span className="ml-2 text-[11px] font-semibold uppercase text-smoke">hidden</span>}
                </p>
                {p.subtitle && <p className="text-[12px] text-smoke">{p.subtitle}</p>}
                <p className="mt-1 text-[11px] text-smoke">
                  {p.startsAt || p.endsAt
                    ? `${p.startsAt ? fmtDate(p.startsAt) : "always"} → ${p.endsAt ? fmtDate(p.endsAt) : "no end"}`
                    : "always visible"}
                  {p.linkUrl ? " · has link" : " · no link"}
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
                <a href={`/admin/promotions?edit=${p.id}`} className="rounded-xl border border-line bg-white px-3 py-1.5 text-[12px] font-semibold">Edit</a>
                <form action={deletePromotion}>
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmButton
                    message={`Delete “${p.title}”?`}
                    className="rounded-xl border border-line bg-white px-3 py-1.5 text-[12px] font-semibold text-spring-red"
                  >
                    Delete
                  </ConfirmButton>
                </form>
              </div>
            </div>
          );
        })}
        {promos.length === 0 && (
          <div className="rounded-xl2 bg-white p-8 text-center text-[14px] text-smoke shadow-card">
            Nothing yet. Add your first promotion above — it appears on every member&apos;s home screen.
          </div>
        )}
      </section>
    </div>
  );
}
