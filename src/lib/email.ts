/** Transactional email. Uses Resend when configured; otherwise logs (dev). */

const KEY = (process.env.RESEND_API_KEY ?? "").trim();
const FROM = (process.env.EMAIL_FROM ?? "ReformerX <noreply@reformerx.cz>").trim();

export function emailConfigured(): boolean {
  return KEY.length > 0;
}

export async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<boolean> {
  if (!KEY) {
    console.log(`[email:dev] to=${to} subject=${subject}\n${text ?? html}`);
    return true; // dev mode: the code is in the server log
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
    });
    if (!res.ok) {
      console.error("[email] send failed:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] error:", e);
    return false;
  }
}

export function loginCodeEmail(code: string, name: string) {
  const text = `Hi ${name},\n\nYour ReformerX sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't ask for it, you can ignore this email.\n\nSee you at the studio.\nReformerX · Haštalská, Prague 1`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F2F0EA;padding:32px">
  <div style="max-width:440px;margin:0 auto;background:#FDFCF9;border-radius:20px;padding:32px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8A8378">ReformerX</p>
    <h1 style="margin:0 0 16px;font-size:24px;color:#171310">Your sign-in code</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#4A443D">Hi ${name}, use this code to sign in to the ReformerX member app:</p>
    <p style="margin:0 0 20px;font-size:34px;font-weight:700;letter-spacing:.18em;color:#171310">${code}</p>
    <p style="margin:0;font-size:13px;color:#8A8378">Expires in 10 minutes. If this wasn't you, ignore this email.</p>
  </div>
</div>`;
  return { subject: `${code} is your ReformerX sign-in code`, html, text };
}

/**
 * Studio broadcast / one-to-one message.
 *
 * The admin types plain text; this wraps it in the ReformerX shell so every
 * email looks the same. Paragraphs split on blank lines, and everything is
 * escaped — the message goes out to hundreds of members, so a stray angle
 * bracket must not be able to break the markup or inject anything.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function studioMessageEmail(opts: {
  name: string;
  subject: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  const first = (opts.name || "").split(" ")[0] || "there";
  const paragraphs = opts.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const htmlBody = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4A443D">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`
    )
    .join("");

  const cta =
    opts.ctaUrl && opts.ctaLabel
      ? `<p style="margin:24px 0 0"><a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background:#171310;color:#FDFCF9;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:12px">${escapeHtml(opts.ctaLabel)}</a></p>`
      : "";

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F2F0EA;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#FDFCF9;border-radius:20px;padding:32px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8A8378">ReformerX</p>
    <h1 style="margin:0 0 20px;font-size:24px;line-height:1.25;color:#171310">${escapeHtml(opts.subject)}</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4A443D">Hi ${escapeHtml(first)},</p>
    ${htmlBody}
    ${cta}
    <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #E4E1D7;font-size:13px;color:#8A8378">
      See you at the studio.<br />ReformerX · Haštalská, Prague 1
    </p>
  </div>
</div>`;

  const text = `Hi ${first},\n\n${paragraphs.join("\n\n")}${
    opts.ctaUrl ? `\n\n${opts.ctaLabel}: ${opts.ctaUrl}` : ""
  }\n\nSee you at the studio.\nReformerX · Haštalská, Prague 1`;

  return { subject: opts.subject, html, text };
}
