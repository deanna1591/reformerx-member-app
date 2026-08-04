/**
 * Unsubscribe links.
 *
 * The link has to work from an email client with no session, so it carries a
 * signed token rather than relying on a cookie. HMAC over the member id means a
 * link can't be forged or edited to unsubscribe somebody else.
 *
 * Deliberately no expiry: an unsubscribe link must keep working. A member who
 * finds an old email six months later and wants out should be able to act on
 * it — a dead link there is worse than the marginal risk of a long-lived token.
 */

import crypto from "crypto";

const SECRET = (process.env.UNSUBSCRIBE_SECRET || process.env.OTP_SECRET || "").trim();

function sign(memberId: string): string {
  return crypto
    .createHmac("sha256", SECRET || "rx-unsubscribe-fallback")
    .update(`unsub:${memberId}`)
    .digest("base64url")
    .slice(0, 32);
}

export function unsubscribeToken(memberId: string): string {
  return `${Buffer.from(memberId).toString("base64url")}.${sign(memberId)}`;
}

/** Returns the member id, or null when the token is missing or tampered with. */
export function verifyUnsubscribeToken(token: string | undefined | null): string | null {
  if (!token || !token.includes(".")) return null;
  const [encoded, mac] = token.split(".");
  let memberId: string;
  try {
    memberId = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!memberId) return null;

  const expected = sign(memberId);
  // Constant-time compare — a plain === leaks timing information about the MAC.
  const a = Buffer.from(mac ?? "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return memberId;
}

/** Absolute URL for the member's unsubscribe page. */
export function unsubscribeUrl(memberId: string): string {
  const base = (process.env.APP_URL || "https://app.reformerx.cz").replace(/\/$/, "");
  return `${base}/unsubscribe?t=${unsubscribeToken(memberId)}`;
}
