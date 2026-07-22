import { createHash, randomInt, timingSafeEqual } from "crypto";
import { getDB, saveDB } from "./store";

const TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const MAX_PER_HOUR = 5;

const norm = (email: string) => email.trim().toLowerCase();
const hash = (code: string, email: string) =>
  createHash("sha256").update(`${norm(email)}:${code}:${process.env.OTP_SECRET ?? "reformerx"}`).digest("hex");

function prune() {
  const db = getDB();
  const now = Date.now();
  db.loginCodes = (db.loginCodes ?? []).filter(
    (c) => new Date(c.expiresAt).getTime() > now - 60 * 60000
  );
}

/** Create a code. Returns null when the address is rate-limited. */
export function issueCode(email: string): string | null {
  prune();
  const db = getDB();
  const e = norm(email);
  const hourAgo = Date.now() - 60 * 60000;
  const recent = (db.loginCodes ?? []).filter((c) => c.email === e && new Date(c.createdAt).getTime() > hourAgo);
  if (recent.length >= MAX_PER_HOUR) return null;

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // Keep prior entries so the hourly limit can actually see them; only the
  // newest code is accepted at verification time.
  db.loginCodes = [
    ...(db.loginCodes ?? []),
    {
      email: e,
      codeHash: hash(code, e),
      expiresAt: new Date(Date.now() + TTL_MIN * 60000).toISOString(),
      attempts: 0,
      createdAt: new Date().toISOString(),
    },
  ];
  saveDB();
  return code;
}

export function verifyCode(email: string, code: string): { ok: boolean; reason?: string } {
  prune();
  const db = getDB();
  const e = norm(email);
  const entry = (db.loginCodes ?? [])
    .filter((c) => c.email === e)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  if (!entry) return { ok: false, reason: "Request a new code." };
  if (new Date(entry.expiresAt).getTime() < Date.now()) return { ok: false, reason: "That code expired." };
  if (entry.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "Too many tries — request a new code." };

  entry.attempts++;
  saveDB();

  const a = Buffer.from(hash(code.trim(), e));
  const b = Buffer.from(entry.codeHash);
  const match = a.length === b.length && timingSafeEqual(a, b);
  if (!match) return { ok: false, reason: "That code doesn't match." };

  db.loginCodes = (db.loginCodes ?? []).filter((c) => c.email !== e);
  saveDB();
  return { ok: true };
}
