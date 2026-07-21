import { cookies } from "next/headers";
import { getDB } from "./store";
import { Member } from "./types";

export function currentMember(): Member | null {
  const id = cookies().get("rx_member")?.value;
  if (!id) return null;
  return getDB().members.find((m) => m.id === id) ?? null;
}

export function isAdmin(): boolean {
  return cookies().get("rx_admin")?.value === "1";
}
