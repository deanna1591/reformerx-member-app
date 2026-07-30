import { getT } from "@/lib/i18n";
import { ensureDB, getDB } from "@/lib/store";
import { membershipActive } from "@/lib/engine";
import { emailConfigured, MAX_PER_SEND, BATCH_SIZE } from "@/lib/email";
import { sendStudioEmail } from "@/app/actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function AdminEmail({
  searchParams,
}: {
  searchParams: { sent?: string; failed?: string; error?: string; to?: string; part?: string; apierror?: string };
}) {
  await ensureDB();
  const db = getDB();
  const t = getT();

  const withEmail = db.members.filter(
    (m) => m.email && m.email.includes("@") && !m.email.endsWith("@example.invalid")
  );
  const active = withEmail.filter((m) => membershipActive(m));
  const preselect = searchParams.to
    ? withEmail.find((m) => m.id === searchParams.to || m.email === searchParams.to)
    : undefined;

  const configured = emailConfigured();
  const expired = withEmail.length - active.length;
  // Shown next to each audience so the admin knows before pressing Send whether
  // it takes one pass or several.
  const partsFor = (n: number) => Math.max(1, Math.ceil(n / MAX_PER_SEND));
  const label = (base: string, n: number) => {
    const p = partsFor(n);
    return p > 1 ? `${base} — ${p} sends needed` : base;
  };
  const maxParts = partsFor(withEmail.length);

  return (
    <main className="px-5 py-6">
      <h1 className="font-display text-[26px] uppercase tracking-wide">{t("adm.email")}</h1>
      <p className="mt-1 text-[13px] text-smoke">{t("adm.emailIntro")}</p>

      {!configured && (
        <p className="mt-4 rounded-xl2 border border-line bg-white p-4 text-[13px] text-tan-deep">
          {t("adm.emailNotConfigured")}
        </p>
      )}

      {searchParams.sent && (
        <div className="mt-4 rounded-xl2 bg-sage-soft p-4">
          <p className="text-[14px] font-semibold">
            {t("adm.emailSent", { n: searchParams.sent })}
            {searchParams.failed ? ` · ${t("adm.emailFailed", { n: searchParams.failed })}` : ""}
            {searchParams.part ? ` · ${t("adm.emailPartDone", { p: searchParams.part })}` : ""}
          </p>
          {searchParams.apierror && (
            <p className="mt-1 break-words text-[12px] text-tan-deep">{searchParams.apierror}</p>
          )}
        </div>
      )}
      {searchParams.error && (
        <p className="mt-4 rounded-xl2 border border-line bg-white p-4 text-[13px] text-tan-deep">
          {searchParams.error === "missing"
            ? t("adm.emailNeedBoth")
            : searchParams.error === "norecipients"
              ? t("adm.emailNoRecipients")
              : searchParams.error === "badpart"
                ? t("adm.emailBadPart")
                : t("adm.emailNotConfigured")}
        </p>
      )}

      <form action={sendStudioEmail} className="mt-5 space-y-4 rounded-xl2 bg-card p-5 shadow-card">
        <div>
          <label htmlFor="audience">{t("adm.emailAudience")}</label>
          <select id="audience" name="audience" defaultValue={preselect ? "one" : "active"}>
            <option value="one">{t("adm.emailOne")}</option>
            <option value="active">{label(t("adm.emailActive", { n: active.length }), active.length)}</option>
            <option value="expired">{label(t("adm.emailExpired", { n: expired }), expired)}</option>
            <option value="all">{label(t("adm.emailAll", { n: withEmail.length }), withEmail.length)}</option>
          </select>
        </div>

        <div>
          <label htmlFor="memberId">{t("adm.emailMember")}</label>
          <select id="memberId" name="memberId" defaultValue={preselect?.id ?? ""}>
            <option value="">—</option>
            {withEmail
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.email}
                </option>
              ))}
          </select>
          <p className="mt-1 text-[12px] text-smoke">{t("adm.emailMemberHelp")}</p>
        </div>

        {maxParts > 1 && (
          <div>
            <label htmlFor="part">{t("adm.emailPart")}</label>
            <select id="part" name="part" defaultValue="1">
              {Array.from({ length: maxParts }, (_, i) => (
                <option key={i} value={i + 1}>
                  {t("adm.emailPartN", { n: i + 1, of: maxParts })}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[12px] text-smoke">{t("adm.emailPartHelp")}</p>
          </div>
        )}

        <div>
          <label htmlFor="subject">{t("adm.emailSubject")}</label>
          <input id="subject" name="subject" required maxLength={150} placeholder="New Saturday 9:00 class" />
        </div>

        <div>
          <label htmlFor="body">{t("adm.emailBody")}</label>
          <textarea id="body" name="body" required rows={8} maxLength={5000} placeholder={t("adm.emailBodyHint")} />
          <p className="mt-1 text-[12px] text-smoke">{t("adm.emailBodyHelp")}</p>
        </div>

        <div>
          <label htmlFor="image">{t("adm.emailImage")}</label>
          <input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp" />
          <p className="mt-1 text-[12px] text-smoke">{t("adm.emailImageHelp")}</p>
        </div>

        <div>
          <label htmlFor="imageUrl">{t("adm.emailImageUrl")}</label>
          <input id="imageUrl" name="imageUrl" maxLength={500} placeholder="https://..." />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ctaLabel">{t("adm.emailCtaLabel")}</label>
            <input id="ctaLabel" name="ctaLabel" maxLength={40} placeholder="Book a class" />
          </div>
          <div>
            <label htmlFor="ctaUrl">{t("adm.emailCtaUrl")}</label>
            <input id="ctaUrl" name="ctaUrl" maxLength={300} placeholder="https://app.reformerx.cz/schedule" />
          </div>
        </div>

        <button
          disabled={!configured}
          className="w-full rounded-xl2 bg-ink py-3 text-[14px] font-semibold text-white disabled:opacity-40"
        >
          {t("adm.emailSend")}
        </button>
        <p className="text-[12px] text-smoke">
          {t("adm.emailLimit", { max: MAX_PER_SEND, batch: BATCH_SIZE })}
        </p>
      </form>
    </main>
  );
}
