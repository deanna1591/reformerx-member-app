import { getDB, ensureDB } from "@/lib/store";
import { getT } from "@/lib/i18n";
import { saveInstructor, removeInstructorPhoto } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function InstructorsPage({ searchParams }: { searchParams: { edit?: string; saved?: string } }) {
  await ensureDB();
  const db = getDB();
  const t = getT();
  const editing = searchParams.edit ? db.instructors.find((i) => i.id === searchParams.edit) : undefined;

  const classCount = (id: string) => db.classes.filter((c) => c.instructorId === id).length;

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-[32px]">{t("adm.instructors")}</h1>
      <p className="mt-1 text-[13px] text-smoke">
        {t("adm.f.instructorsLead")}
      </p>

      {searchParams.saved && (
        <div className="mt-4 rounded-xl border border-spring-green/40 bg-spring-green/10 px-4 py-3 text-[13px]">
          {t("adm.saved")}
        </div>
      )}

      {/* Add / edit */}
      <section className="mt-5 rounded-xl2 bg-white p-5 shadow-card">
        <h2 className="font-display text-[20px]">{editing ? `${t("adm.edit")} — ${editing.name}` : t("adm.f.addInstructor")}</h2>
        <form action={saveInstructor} className="mt-4 grid gap-4 sm:grid-cols-2" encType="multipart/form-data">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div>
            <label htmlFor="name">{t("adm.f.name")}</label>
            <input id="name" name="name" required defaultValue={editing?.name} className="mt-1.5" placeholder="Karolina" />
          </div>
          <div>
            <label htmlFor="role">{t("adm.f.role")}</label>
            <input id="role" name="role" defaultValue={editing?.role ?? "Instructor"} className="mt-1.5" placeholder="Senior coach" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="bio">{t("adm.f.shortBio")}</label>
            <textarea
              id="bio"
              name="bio"
              rows={3}
              defaultValue={editing?.bio}
              className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-[14px]"
              placeholder={t("adm.f.bioPlaceholder")}
            />
          </div>
          <div>
            <label htmlFor="photo">{t("adm.f.photo")}</label>
            <input id="photo" name="photo" type="file" accept="image/*" className="mt-1.5 text-[13px]" />
            <p className="mt-1 text-[11px] text-smoke">{t("adm.f.photoHint")}</p>
          </div>
          <div>
            <label htmlFor="photoUrl">{t("adm.f.orImageUrl")}</label>
            <input id="photoUrl" name="photoUrl" defaultValue={editing?.photoUrl?.startsWith("http") ? editing.photoUrl : ""} className="mt-1.5" placeholder="https://…" />
          </div>

          <div className="sm:col-span-2 border-t border-line pt-4">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-smoke">{t("adm.f.dashboardAccess")}</p>
          </div>
          <div>
            <label htmlFor="email">{t("adm.f.signInEmail")}</label>
            <input id="email" name="email" type="email" defaultValue={editing?.email} className="mt-1.5" placeholder="coach@reformerx.cz" />
          </div>
          <div>
            <label htmlFor="pin">{t("adm.f.pin")} {editing?.pinHash && <span className="font-normal text-smoke">({t("adm.f.pinKeep")})</span>}</label>
            <input id="pin" name="pin" inputMode="numeric" pattern="[0-9]*" maxLength={8} className="mt-1.5" placeholder={t("adm.f.pinHint")} />
          </div>
          <div>
            <label htmlFor="staffRole">{t("adm.f.accessLevel")}</label>
            <select id="staffRole" name="staffRole" defaultValue={editing?.staffRole ?? "instructor"} className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-[14px]">
              <option value="instructor">{t("adm.f.accessInstructor")}</option>
              <option value="owner">{t("adm.f.accessOwner")}</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" name="active" defaultChecked={editing ? editing.active !== false : true} className="h-4 w-4" />
              {t("adm.f.active")}
            </label>
          </div>

          <div className="sm:col-span-2 flex gap-2">
            <button className="rounded-xl bg-ink px-5 py-2.5 text-[14px] font-semibold text-white">
              {editing ? t("adm.saveChanges") : t("adm.f.addInstructor")}
            </button>
            {editing && (
              <a href="/admin/instructors" className="rounded-xl border border-line bg-white px-5 py-2.5 text-[14px] font-semibold">
                {t("adm.cancel")}
              </a>
            )}
          </div>
        </form>
      </section>

      {/* Team */}
      <section className="mt-6 space-y-2">
        {db.instructors.map((i) => (
          <div key={i.id} className="flex items-center gap-4 rounded-xl2 bg-white p-4 shadow-card">
            {i.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={i.photoUrl} alt={i.name} className="h-14 w-14 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-sage-soft font-display text-[20px]">
                {i.name[0]}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {i.name}
                {i.active === false && <span className="ml-2 text-[11px] font-semibold uppercase text-smoke">{t("adm.f.hidden")}</span>}
                {i.staffRole === "owner" && <span className="ml-2 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold uppercase text-white">{t("adm.owner")}</span>}
              </p>
              <p className="text-[12px] text-smoke">{i.role}</p>
              {i.bio && <p className="mt-1 line-clamp-2 text-[12px] text-smoke">{i.bio}</p>}
              <p className="mt-1 text-[11px] text-smoke">
                {t("adm.f.classesCount", { n: classCount(i.id) })} · {i.email ? `${i.email} · ${i.pinHash ? t("adm.f.pinSet") : t("adm.f.noPin")}` : t("adm.f.noAccess")}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <a href={`/admin/instructors?edit=${i.id}`} className="rounded-xl border border-line bg-white px-3 py-1.5 text-[12px] font-semibold">
                Edit
              </a>
              {i.photoUrl && (
                <form action={removeInstructorPhoto}>
                  <input type="hidden" name="id" value={i.id} />
                  <button className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-[12px] font-semibold text-smoke">
                    {t("adm.f.removePhoto")}
                  </button>
                </form>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
