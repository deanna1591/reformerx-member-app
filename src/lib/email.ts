/** Transactional email. Uses Resend when configured; otherwise logs (dev). */

const KEY = (process.env.RESEND_API_KEY ?? "").trim();
const FROM = (process.env.EMAIL_FROM ?? "ReformerX <noreply@reformerx.cz>").trim();
/** Where member replies land. The From address is unattended. */
const REPLY_TO = (process.env.EMAIL_REPLY_TO ?? "info@reformerx.cz").trim();
export { REPLY_TO };

/**
 * Header logo.
 *
 * EMAIL_LOGO_URL wins, and hosting it on reformerx.cz is preferable to a
 * supabase.co URL — spam filters weigh whether linked domains match the sender.
 * Falls back to our Storage bucket, then to the wordmark in type, so the header
 * is never empty.
 *
 * Never use a CDN link carrying an expiry token (LinkedIn's do): the image would
 * break in every email sent after it lapses, with nothing to warn you.
 */
const LOGO_URL = (() => {
  if (process.env.EMAIL_LOGO_URL) return process.env.EMAIL_LOGO_URL.trim();
  const base = (process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const bucket = process.env.SUPABASE_MEDIA_BUCKET || "rx-media";
  return base ? `${base}/storage/v1/object/public/${bucket}/brand/email-logo.png` : "";
})();

/** Display height in px. Width follows the image's own proportions. */
const LOGO_HEIGHT = Math.max(16, Math.min(120, Number(process.env.EMAIL_LOGO_HEIGHT ?? 40) || 40));

/** Set EMAIL_LOGO_PANEL=0 if the logo is dark and needs no panel behind it. */
const LOGO_PANEL = process.env.EMAIL_LOGO_PANEL !== "0";

/**
 * The header block: logo if we have one, otherwise the wordmark in type.
 *
 * A white logo is invisible on the near-white card, so it sits on an ink panel.
 * That panel is a table with both the bgcolor attribute and a background-color
 * style — Outlook ignores CSS backgrounds on divs, and a missing background is
 * the one failure that makes the logo disappear entirely.
 *
 * Height is fixed and width deliberately omitted: the mark may be a square
 * monogram or a wide wordmark, and a hardcoded width would squash one of them.
 */
function header(): string {
  if (!LOGO_URL || !/^https:\/\//.test(LOGO_URL)) {
    return `<p style="margin:0 0 4px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8A8378">ReformerX</p>`;
  }

  const img = `<img src="${LOGO_URL}" alt="ReformerX" height="${LOGO_HEIGHT}" style="display:block;height:${LOGO_HEIGHT}px;width:auto;max-width:220px;border:0" />`;

  if (!LOGO_PANEL) {
    return `<div style="margin:0 0 18px">${img}</div>`;
  }

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 22px">
      <tr>
        <td bgcolor="#171310" align="center" style="background-color:#171310;border-radius:14px;padding:20px 24px">
          ${img.replace('style="display:block;', 'style="display:inline-block;')}
        </td>
      </tr>
    </table>`;
}

export function emailConfigured(): boolean {
  return KEY.length > 0;
}

/**
 * Resend accepts up to 100 messages in one call to /emails/batch. Sending them
 * one request at a time hits the 2-per-second rate limit and, for a studio of a
 * thousand members, cannot finish inside Vercel's 60s function cap.
 */
export const BATCH_SIZE = 100;

/**
 * Most recipients one send may cover, set by Vercel's 60s function timeout
 * rather than by the provider.
 *
 * At 100 per batch request and ~400ms each plus 500ms spacing, 2000 recipients
 * is 20 requests and roughly 18 seconds — comfortable. Beyond that the timeout
 * starts deciding who got an email, which is exactly what this prevents.
 *
 * A send is limited by whichever is smaller, this or the remaining daily quota.
 */
export const MAX_PER_SEND = 2000;

/**
 * Emails the provider will accept in a day.
 *
 * Resend's free tier is 100/day. MAX_PER_SEND above only ever described what
 * fits inside Vercel's function timeout — it said 1000, which let a send start
 * that could only deliver a tenth of itself. This is the limit that actually
 * bites, so it is the one the admin is shown.
 */
export const DAILY_LIMIT = Math.max(1, Number(process.env.EMAIL_DAILY_LIMIT ?? 100) || 100);

export type BatchResult = { sent: number; failed: number; errors: string[] };

/**
 * Send many messages. Returns per-message counts and any API errors verbatim —
 * a Resend quota block reads as a normal failure otherwise, and the admin would
 * have no idea half the studio never received it.
 */
export async function sendEmailBatch(
  messages: Array<{ to: string; subject: string; html: string; text?: string }>
): Promise<BatchResult> {
  if (!KEY) {
    for (const m of messages) console.log(`[email:dev] to=${m.to} subject=${m.subject}`);
    return { sent: messages.length, failed: 0, errors: [] };
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          chunk.map((m) => ({
            from: FROM,
            to: [m.to],
            reply_to: REPLY_TO,
            subject: m.subject,
            html: m.html,
            text: m.text,
          }))
        ),
      });
      const bodyText = await res.text().catch(() => "");
      if (!res.ok) {
        failed += chunk.length;
        const msg = `${res.status}: ${bodyText.slice(0, 200)}`;
        if (!errors.includes(msg)) errors.push(msg);
        console.error("[email] batch failed:", msg);
      } else {
        // A 200 can still carry per-message errors.
        let perMessageErrors = 0;
        try {
          const parsed = JSON.parse(bodyText) as { data?: Array<{ id?: string; error?: unknown }> };
          for (const row of parsed.data ?? []) if (row.error) perMessageErrors++;
        } catch {
          /* unparseable success body — treat the whole chunk as sent */
        }
        sent += chunk.length - perMessageErrors;
        failed += perMessageErrors;
        if (perMessageErrors) errors.push(`${perMessageErrors} message(s) rejected in one batch`);
      }
    } catch (e) {
      failed += chunk.length;
      const msg = e instanceof Error ? e.message : String(e);
      if (!errors.includes(msg)) errors.push(msg);
    }
    // Stay under the 2-requests-per-second limit.
    if (i + BATCH_SIZE < messages.length) await new Promise((r) => setTimeout(r, 500));
  }

  return { sent, failed, errors };
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
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, html, text }),
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
    ${header()}
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
  /** Absolute https URL. Data URLs are stripped by most mail clients. */
  imageUrl?: string;
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

  // width attribute as well as CSS: Outlook ignores max-width on images.
  // display:block kills the baseline gap, and the subject doubles as alt text so
  // the email still reads with images turned off.
  const image =
    opts.imageUrl && /^https:\/\//.test(opts.imageUrl)
      ? `<img src="${escapeHtml(opts.imageUrl)}" alt="${escapeHtml(opts.subject)}" width="456" style="display:block;width:100%;max-width:456px;height:auto;border-radius:12px;margin:0 0 20px" />`
      : "";

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F2F0EA;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#FDFCF9;border-radius:20px;padding:32px">
    ${header()}
    <h1 style="margin:0 0 20px;font-size:24px;line-height:1.25;color:#171310">${escapeHtml(opts.subject)}</h1>
    ${image}
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4A443D">Hi ${escapeHtml(first)},</p>
    ${htmlBody}
    ${cta}
    <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #E4E1D7;font-size:13px;color:#8A8378">
      ReformerX · Haštalská, Prague 1<br />
      Reply to this email or write to <a href="mailto:${REPLY_TO}" style="color:#8A8378">${REPLY_TO}</a>
    </p>
  </div>
</div>`;

  const text = `Hi ${first},\n\n${paragraphs.join("\n\n")}${
    opts.ctaUrl ? `\n\n${opts.ctaLabel}: ${opts.ctaUrl}` : ""
  }\n\nReformerX · Haštalská, Prague 1\nReply to this email or write to ${REPLY_TO}`;

  return { subject: opts.subject, html, text };
}
