import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getDB } from "./store";
import { Instructor } from "./types";

const SALT = process.env.STAFF_PIN_SECRET ?? "reformerx-staff";

export function hashPin(pin: string): string {
  return createHash("sha256").update(`${pin.trim()}:${SALT}`).digest("hex");
}

export function pinMatches(pin: string, hash?: string): boolean {
  if (!hash) return false;
  const a = Buffer.from(hashPin(pin));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The signed-in staff member, if any (instructors sign in with email + PIN). */
export function currentStaff(): Instructor | null {
  const id = cookies().get("rx_staff")?.value;
  if (!id) return null;
  const staff = getDB().instructors.find((i) => i.id === id);
  return staff && staff.active !== false ? staff : null;
}

/** Owner = full access (studio password or an owner-role staff account). */
export function isOwner(): boolean {
  if (cookies().get("rx_admin")?.value === "1") return true;
  return currentStaff()?.staffRole === "owner";
}

/** Anyone allowed into the studio dashboard. */
export function isStaff(): boolean {
  return isOwner() || currentStaff() !== null;
}

/** Pages instructors shouldn't reach (settings, challenge design, staff admin). */
export const OWNER_ONLY = ["/admin/settings", "/admin/challenges", "/admin/instructors", "/admin/promotions", "/admin/health"];
