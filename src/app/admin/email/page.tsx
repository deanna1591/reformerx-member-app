import { getT } from "@/lib/i18n";
import { ensureDB, getDB } from "@/lib/store";
import { membershipActive } from "@/lib/engine";
import { emailConfigured, DAILY_LIMIT, MAX_PER_SEND } from "@/lib/email";
import { studioDayKeySafe } from "@/lib/time";
import { sendStudioEmail } from "@/app/actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function AdminEmail({
  searchParams,
}: {
  searchParams: {
    sent?: string; failed?: string; error?: string; to?: string;
    apierror?: string; skipped?: string; remaining?: string; subject?: string; done?: string;
  };
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

  // The provider's daily cap is the real constraint, so show exactly what is
  // left today rather than a theoretical per-send maximum.
  const log = db.emailLog ?? [];
  const today = studioDayKeySafe(new Date());
  const sentToday = log.filter((e) => studioDayKeySafe(e.sentAt) === today).length;
  const leftToday = Math.max(0, DAILY_LIMIT - sentToday);
  // What this next send can actually cover.
  const perSend = Math.min(leftToday, MAX_PER_SEND);

  // Campaigns still owing recipients, newest first.
  const campaigns = Array.from(new Set(log.map((e) => e.subject)))
    .map((subject) => {
      const rows = log.filter((e) => e.subject === subject);
      const sentIds = new Set(rows.map((e) => e.memberId));
      return {
        subject,
        sent: rows.length,
        outstanding: withEmail.filter((m) => !sentIds.has(m.id)).length,
        last: rows.reduce((a, b) => (a > b.sentAt ? a : b.sentAt), ""),
      };
    })
    .sort((a, b) => b.last.localeCompare(a.last))
    .slice(0, 5);

  const label = (base: string, n: number) => {
    if (n <= perSend) return base;
    if (n > leftToday && leftToday < MAX_PER_SEND)
      return `${base} — ${Math.ceil(n / DAILY_LIMIT)} days at ${DAILY_LIMIT}/day`;
    return `${base} — ${Math.ceil(n / MAX_PER_SEND)} sends`;
  };

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
            {searchParams.skipped ? ` · ${t("adm.emailSkipped", { n: searchParams.skipped })}` : ""}
            {searchParams.remaining ? ` · ${t("adm.emailRemaining", { n: searchParams.remaining })}` : ""}
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
              : searchParams.error === "quota"
                ? t("adm.emailQuotaSpent", { n: searchParams.remaining ?? "0", limit: DAILY_LIMIT })
                : t("adm.emailNotConfigured")}
        </p>
      )}

      {searchParams.done && (
        <p className="mt-4 rounded-xl2 bg-sage-soft p-4 text-[14px] font-semibold">
          {t("adm.emailCampaignDone", { subject: searchParams.done })}
        </p>
      )}

      {/* The daily allowance, stated plainly. */}
      <div className="mt-4 rounded-xl2 border border-line bg-white p-4">
        <p className="text-[14px] font-semibold">
          {t("adm.emailToday", { sent: sentToday, limit: DAILY_LIMIT, left: leftToday })}
        </p>
        <p className="mt-1 text-[12px] text-smoke">{t("adm.emailQuotaHelp")}</p>
      </div>

      {campaigns.some((c) => c.outstanding > 0) && (
        <div className="mt-4 rounded-xl2 bg-card p-4 shadow-card">
          <p className="text-[13px] font-semibold">{t("adm.emailUnfinished")}</p>
          <ul className="mt-2 space-y-1">
            {campaigns
              .filter((c) => c.outstanding > 0)
              .map((c) => (
                <li key={c.subject} className="text-[13px] text-smoke">
                  <span className="font-medium text-ink">{c.subject}</span> —{" "}
                  {t("adm.emailCampaignState", { sent: c.sent, left: c.outstanding })}
                </li>
              ))}
          </ul>
          <p className="mt-2 text-[12px] text-smoke">{t("adm.emailContinueHelp")}</p>
        </div>
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
          disabled={!configured || perSend === 0}
          className="w-full rounded-xl2 bg-ink py-3 text-[14px] font-semibold text-white disabled:opacity-40"
        >
          {t("adm.emailSend")}
        </button>
        <p className="text-[12px] text-smoke">
          {perSend === 0 ? t("adm.emailNoneLeft") : t("adm.emailWillSend", { n: perSend })}
        </p>
      </form>
    </main>
  );
}
