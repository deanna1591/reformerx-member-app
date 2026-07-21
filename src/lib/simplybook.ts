/**
 * SimplyBook.me integration (REST API v2).
 *
 * Auth model: an **API User Key** (SimplyBook admin → Custom Features → API → API User Keys).
 * We authenticate with company + user login + user API key, receive a short-lived token,
 * and send it as X-Token on every admin request.
 *
 * Required env vars (.env.local / Vercel):
 *   SIMPLYBOOK_COMPANY    e.g. "reformerx"           (your company login / subdomain)
 *   SIMPLYBOOK_LOGIN      e.g. "api@reformerx.cz"    (the user the key was created for)
 *   SIMPLYBOOK_USER_KEY   the API User Key
 * Optional:
 *   SIMPLYBOOK_API_BASE   default "https://user-api-v2.simplybook.it"
 */
import { getDB, saveDB } from "./store";
import type { Member, MembershipType } from "./types";

const BASE = process.env.SIMPLYBOOK_API_BASE || "https://user-api-v2.simplybook.it";

export function simplybookConfigured(): boolean {
  return Boolean(
    process.env.SIMPLYBOOK_COMPANY && process.env.SIMPLYBOOK_LOGIN && process.env.SIMPLYBOOK_USER_KEY
  );
}

/* ---------------------------------- auth ---------------------------------- */

let cachedToken: { token: string; expiresAt: number } | null = null;

const clean = (v?: string) => (v ?? "").trim().replace(/^["']|["']$/g, "");

/** Auth. API User Keys are accepted by the REST v2 /admin/auth on most accounts,
 *  but some accounts only honor them via the JSON-RPC getUserToken endpoint —
 *  so we try REST first and fall back to JSON-RPC. Tokens are interchangeable. */
async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  const company = clean(process.env.SIMPLYBOOK_COMPANY);
  const login = clean(process.env.SIMPLYBOOK_LOGIN);
  const key = clean(process.env.SIMPLYBOOK_USER_KEY);

  // Attempt 1: REST v2
  let restError = "";
  try {
    const res = await fetch(`${BASE}/admin/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, login, password: key }),
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { token: string };
      cachedToken = { token: data.token, expiresAt: Date.now() + 50 * 60 * 1000 };
      return data.token;
    }
    restError = `REST auth ${res.status}: ${await res.text()}`;
  } catch (e) {
    restError = `REST auth error: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Attempt 2: JSON-RPC getUserToken (canonical endpoint for API User Keys)
  const rpcBase = BASE.replace("user-api-v2", "user-api");
  const rpcRes = await fetch(`${rpcBase}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "getUserToken", params: [company, login, key], id: 1 }),
    cache: "no-store",
  });
  const rpc = (await rpcRes.json().catch(() => ({}))) as { result?: string; error?: { message?: string } };
  if (rpc.result) {
    cachedToken = { token: rpc.result, expiresAt: Date.now() + 50 * 60 * 1000 };
    return rpc.result;
  }

  throw new Error(
    `SimplyBook auth failed. ${restError} | JSON-RPC: ${rpc.error?.message ?? rpcRes.status}. ` +
      `Check: SIMPLYBOOK_LOGIN must be the exact login of the user the API User Key was generated for ` +
      `(see SimplyBook → Manage → Users, "Login" column — it may differ from the email), and the key must be active.`
  );
}

async function sb<T>(path: string): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Company-Login": process.env.SIMPLYBOOK_COMPANY as string,
      "X-Token": token,
    },
    cache: "no-store",
  });
  if (res.status === 401) {
    cachedToken = null; // token expired → retry once
    return sb<T>(path);
  }
  if (!res.ok) throw new Error(`SimplyBook ${path} failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as T;
}

/** Fetch every page of a paginated list endpoint. */
async function sbAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  for (;;) {
    const sep = path.includes("?") ? "&" : "?";
    const data = await sb<{ data?: T[]; metadata?: { pages_count?: number } } | T[]>(
      `${path}${sep}page=${page}&on_page=100`
    );
    const rows = Array.isArray(data) ? data : data.data ?? [];
    out.push(...rows);
    const pages = Array.isArray(data) ? 1 : data.metadata?.pages_count ?? 1;
    if (page >= pages || rows.length === 0) break;
    page++;
  }
  return out;
}

/* --------------------------------- shapes --------------------------------- */

interface SbClient {
  id: number | string;
  name?: string;
  email?: string;
}

interface SbClientMembership {
  id: number | string;
  client_id?: number | string;
  client?: { id?: number | string };
  membership_name?: string;
  name?: string;
  period_start?: string;
  period_end?: string; // "YYYY-MM-DD"
  is_active?: boolean;
  status?: string;
}

interface SbBooking {
  id: number | string;
  code?: string;
  start_datetime?: string; // "YYYY-MM-DD HH:mm:ss"
  end_datetime?: string;
  client?: SbClient;
  client_id?: number | string;
  service?: { id?: number | string; name?: string };
  provider?: { id?: number | string; name?: string };
  status?: string; // "confirmed" | "canceled" | ...
}

/* ---------------------------------- sync ---------------------------------- */

function mapMembershipType(name: string | undefined): MembershipType {
  const n = (name || "").toLowerCase();
  if (n.includes("unlimit")) return "Unlimited";
  if (n.includes("10") || n.includes("package") || n.includes("credit")) return "Package 10";
  if (n.includes("single") || n.includes("drop")) return "Single Entry";
  return "Monthly Pass";
}

export interface SyncResult {
  ok: boolean;
  message: string;
  members?: number;
  memberships?: number;
  bookings?: number;
}

/**
 * Full sync: clients → members, client memberships → membership type/expiry,
 * bookings (yesterday → +14 days) → classes + bookings.
 * Safe to run repeatedly (idempotent upserts keyed on SimplyBook ids).
 */
export async function syncFromSimplybook(): Promise<SyncResult> {
  if (!simplybookConfigured()) {
    return {
      ok: false,
      message:
        "SimplyBook keys not configured. Set SIMPLYBOOK_COMPANY, SIMPLYBOOK_LOGIN and SIMPLYBOOK_USER_KEY — running in demo mode.",
    };
  }

  const db = getDB();

  /* 1 — clients → members */
  const clients = await sbAll<SbClient>("/admin/clients");
  let newMembers = 0;
  for (const c of clients) {
    if (!c.email) continue;
    const sbId = String(c.id);
    let m = db.members.find((x) => x.simplybookId === sbId || x.email.toLowerCase() === c.email!.toLowerCase());
    if (!m) {
      m = {
        id: `m-sb-${sbId}`,
        name: c.name || c.email,
        email: c.email.toLowerCase(),
        membershipType: "Single Entry",
        membershipExpires: new Date(0).toISOString(), // inactive until a membership says otherwise
        joinedAt: new Date().toISOString(),
        qrCode: `RXM-${sbId}-${Math.floor(1000 + Math.random() * 9000)}`,
        simplybookId: sbId,
      } satisfies Member;
      db.members.push(m);
      newMembers++;
    } else {
      m.simplybookId = sbId;
      if (c.name) m.name = c.name;
    }
  }

  /* 2 — memberships → type + expiry (source of truth for "active") */
  let membershipRows = 0;
  try {
    const memberships = await sbAll<SbClientMembership>("/admin/clients/memberships");
    for (const cm of memberships) {
      const clientId = String(cm.client_id ?? cm.client?.id ?? "");
      const m = db.members.find((x) => x.simplybookId === clientId);
      if (!m || !cm.period_end) continue;
      const inactive = cm.is_active === false || cm.status === "canceled";
      if (inactive) continue;
      const end = new Date(`${cm.period_end}T23:59:59`);
      if (end.getTime() > new Date(m.membershipExpires).getTime()) {
        m.membershipExpires = end.toISOString();
        m.membershipType = mapMembershipType(cm.membership_name ?? cm.name);
      }
      membershipRows++;
    }
  } catch {
    // Membership custom feature endpoint can differ per account — bookings still sync.
  }

  /* 3 — bookings (yesterday → +14d) → classes + bookings */
  const from = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const bookings = await sbAll<SbBooking>(
    `/admin/bookings?filter[date_from]=${from}&filter[date_to]=${to}`
  );
  let bookingRows = 0;
  for (const b of bookings) {
    if (!b.start_datetime) continue;
    const canceled = (b.status || "").toLowerCase().includes("cancel");
    const clientId = String(b.client_id ?? b.client?.id ?? "");
    const member = db.members.find((x) => x.simplybookId === clientId);
    const bookingId = `b-sb-${b.id}`;

    if (canceled) {
      db.bookings = db.bookings.filter((x) => x.id !== bookingId);
      continue;
    }
    if (!member) continue;

    // upsert class (one row per service+start time)
    const startsAt = new Date(b.start_datetime.replace(" ", "T")).toISOString();
    const classKey = `c-sb-${b.service?.id ?? "x"}-${startsAt}`;
    let cls = db.classes.find((x) => x.id === classKey);
    if (!cls) {
      const provName = b.provider?.name;
      let instructor = db.instructors.find((i) => provName && i.name.toLowerCase() === provName.toLowerCase());
      if (!instructor && provName) {
        instructor = { id: `i-sb-${b.provider?.id}`, name: provName, role: "Instructor" };
        db.instructors.push(instructor);
      }
      const durationMin =
        b.end_datetime && b.start_datetime
          ? Math.max(
              30,
              Math.round(
                (new Date(b.end_datetime.replace(" ", "T")).getTime() -
                  new Date(b.start_datetime.replace(" ", "T")).getTime()) /
                  60000
              )
            )
          : 55;
      cls = {
        id: classKey,
        title: b.service?.name || "Reformer Class",
        instructorId: instructor?.id ?? db.instructors[0].id,
        startsAt,
        durationMin,
      };
      db.classes.push(cls);
    }

    // upsert booking
    if (!db.bookings.some((x) => x.id === bookingId)) {
      db.bookings.push({ id: bookingId, memberId: member.id, classId: cls.id, source: "simplybook" });
      bookingRows++;
    }
  }

  saveDB();
  return {
    ok: true,
    message: `Synced ${clients.length} clients (${newMembers} new), ${membershipRows} memberships, ${bookingRows} new bookings.`,
    members: clients.length,
    memberships: membershipRows,
    bookings: bookingRows,
  };
}
