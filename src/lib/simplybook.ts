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
async function sbAll<T>(path: string, maxPages = 50): Promise<T[]> {
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
    if (page >= pages || rows.length === 0 || page >= maxPages) break;
    page++;
  }
  return out;
}

/** JSON-RPC call to the documented admin service at {base}/admin.
 *  The REST v2 token is accepted as X-User-Token (shared auth backend). */
async function rpcAdmin<T>(method: string, params: unknown[]): Promise<T> {
  const token = await getToken();
  const rpcBase = BASE.replace("user-api-v2", "user-api");
  const res = await fetch(`${rpcBase}/admin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Company-Login": (process.env.SIMPLYBOOK_COMPANY ?? "").trim(),
      "X-User-Token": token,
      "X-Token": token,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { result?: T; error?: { message?: string } };
  if (data.error) throw new Error(`RPC ${method}: ${data.error.message}`);
  if (data.result === undefined) throw new Error(`RPC ${method}: empty response (${res.status})`);
  return data.result;
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
  membership_title?: string;
  name?: string;
  period_start?: string;
  period_end?: string;
  end_date?: string;
  expire_date?: string;
  date_end?: string;
  is_active?: boolean | number | string;
  is_expired?: boolean;
  can_be_used?: boolean;
  status?: string;
  membership?: { id?: number; name?: string; is_unlimited?: boolean };
}

interface SbBooking {
  id: number | string;
  code?: string;
  start_datetime?: string; // REST: "YYYY-MM-DD HH:mm:ss"
  end_datetime?: string;
  start_date_time?: string; // RPC variant A
  end_date_time?: string;
  start_date?: string; // RPC variant B (live reformerx account)
  end_date?: string;
  event_duration?: string | number;
  is_confirm?: number | string;
  client_email?: string;
  client?: SbClient | string;
  client_id?: number | string;
  service?: { id?: number | string; name?: string };
  event?: string; // RPC: service name
  event_id?: number | string;
  provider?: { id?: number | string; name?: string };
  unit?: string; // RPC: performer name
  unit_id?: number | string;
  status?: string;
  is_confirmed?: number | string | boolean;
  duration?: number;
}

interface SbPackageInstance {
  id?: number;
  client_id?: number | string;
  period_start?: string;
  period_end?: string;
  status?: string;
  can_be_used?: boolean;
  is_used?: boolean;
  package?: { id?: number; name?: string };
}

interface SbInvoice {
  id: number | string;
  client_id?: number | string;
  datetime?: string;
  payment_received?: boolean;
  status?: string;
  package_instances?: SbPackageInstance[];
}

/* ---------------------------------- sync ---------------------------------- */

function mapMembershipType(name: string | undefined): MembershipType {
  const n = (name || "").toLowerCase();
  if (n.includes("unlimit") || n.includes("neomezen")) return "Unlimited";
  if (n.includes("10") || n.includes("package") || n.includes("balíč") || n.includes("balic") || n.includes("credit") || n.includes("kredit"))
    return "Package 10";
  if (n.includes("single") || n.includes("drop") || n.includes("jednorá") ||  n.includes("jednora")) return "Single Entry";
  if (n.includes("month") || n.includes("měsíč") || n.includes("mesic")) return "Monthly Pass";
  return "Member";
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


  /* 3 — bookings (yesterday → +14d) → classes + bookings */
  const from = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  let bookings: SbBooking[] = [];
  let bookingSource = "none";
  try {
    const rows = await rpcAdmin<SbBooking[]>("getBookings", [
      { date_from: from, date_to: to, order: "start_date" },
    ]);
    if (Array.isArray(rows) && rows.length > 0) {
      bookings = rows;
      bookingSource = "JSON-RPC";
    }
  } catch (e) {
    bookingSource = `rpc error: ${e instanceof Error ? e.message : "failed"}`;
  }
  if (bookings.length === 0) {
    for (const path of [
      `/admin/bookings?filter[date_from]=${from}&filter[date_to]=${to}`,
      `/admin/bookings?date_from=${from}&date_to=${to}`,
    ]) {
      try {
        const rows = await sbAll<SbBooking>(path);
        if (rows.length > 0) {
          bookings = rows;
          bookingSource = "REST";
          break;
        }
      } catch {
        /* try next */
      }
    }
  }
  let bookingRows = 0;
  for (const b of bookings) {
    const rawStart = b.start_datetime ?? b.start_date_time ?? b.start_date;
    if (!rawStart) continue;
    const canceled =
      (b.status || "").toLowerCase().includes("cancel") ||
      b.is_confirmed === false || b.is_confirmed === 0 || b.is_confirmed === "0" ||
      b.is_confirm === 0 || b.is_confirm === "0";
    const clientObj = typeof b.client === "object" ? b.client : undefined;
    const clientId = String(b.client_id ?? clientObj?.id ?? "");
    const member =
      db.members.find((x) => x.simplybookId === clientId) ??
      (b.client_email
        ? db.members.find((x) => x.email.toLowerCase() === String(b.client_email).toLowerCase())
        : undefined);
    const bookingId = `b-sb-${b.id}`;

    if (canceled) {
      db.bookings = db.bookings.filter((x) => x.id !== bookingId);
      continue;
    }
    if (!member) continue;

    // upsert class (one row per service+start time)
    const startsAt = new Date(rawStart.replace(" ", "T")).toISOString();
    const serviceId = b.service?.id ?? b.event_id ?? "x";
    const classKey = `c-sb-${serviceId}-${startsAt}`;
    let cls = db.classes.find((x) => x.id === classKey);
    if (!cls) {
      const provName = b.provider?.name ?? b.unit;
      let instructor = db.instructors.find((i) => provName && i.name.toLowerCase() === provName.toLowerCase());
      if (!instructor && provName) {
        instructor = { id: `i-sb-${b.provider?.id ?? b.unit_id ?? provName}`, name: provName, role: "Instructor" };
        db.instructors.push(instructor);
      }
      const rawEnd = b.end_datetime ?? b.end_date_time ?? b.end_date;
      const durationMin = b.duration
        ? Math.max(20, Number(b.duration))
        : b.event_duration
        ? Math.max(20, Number(b.event_duration) || 50)
        : rawEnd
        ? Math.max(30, Math.round((new Date(rawEnd.replace(" ", "T")).getTime() - new Date(rawStart.replace(" ", "T")).getTime()) / 60000))
        : 55;
      cls = {
        id: classKey,
        title: b.service?.name || b.event || "Reformer Class",
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

  /* 2 — memberships → type + expiry (source of truth for "active").
     Strategy A: bulk REST endpoints (fast when the account exposes one).
     Strategy B (documented): per-client JSON-RPC getClientMembershipList(clientId). */
  let membershipRows = 0;
  let membershipSource = "none";
  const applyMembership = (clientId: string, cm: SbClientMembership) => {
    const m = db.members.find((x) => x.simplybookId === clientId);
    const endRaw = cm.period_end ?? cm.end_date ?? cm.expire_date ?? cm.date_end;
    if (!m || !endRaw) return;
    if (cm.is_active === false || cm.is_active === 0 || cm.is_active === "0" || cm.status === "canceled") return;
    if (cm.is_expired === true || cm.can_be_used === false) return;
    const end = new Date(`${String(endRaw).slice(0, 10)}T23:59:59`);
    if (Number.isNaN(end.getTime())) return;
    if (end.getTime() > new Date(m.membershipExpires).getTime()) {
      m.membershipExpires = end.toISOString();
      const productName = cm.membership?.name ?? cm.membership_name ?? cm.name ?? cm.membership_title;
      m.membershipType = cm.membership?.is_unlimited ? "Unlimited" : mapMembershipType(productName);
    }
    membershipRows++;
  };

  let membershipEndpointOk = false;
  for (const path of ["/admin/clients/memberships?filter[active_only]=1", "/admin/clients/memberships"]) {
    try {
      const rows = await sbAll<SbClientMembership>(path, 20);
      membershipEndpointOk = true; // endpoint answered — feature exists but may be unused
      if (rows.length > 0) {
        for (const cm of rows) applyMembership(String(cm.client_id ?? cm.client?.id ?? ""), cm);
        membershipSource = "REST";
      } else if (membershipSource === "none") {
        membershipSource = "REST: feature unused (0 rows)";
      }
      break;
    } catch {
      /* try next */
    }
  }
  if (!membershipEndpointOk && membershipRows === 0) {
    // Documented route — per client. Keep it fast: only clients with recent/upcoming
    // bookings or an existing app booking history, capped per sync run.
    const interesting = new Set<string>();
    for (const b of bookings) {
      const cObj = typeof b.client === "object" ? b.client : undefined;
      const cid = String(b.client_id ?? cObj?.id ?? "");
      if (cid) interesting.add(cid);
    }
    for (const ci of db.checkIns) {
      const m = db.members.find((x) => x.id === ci.memberId);
      if (m?.simplybookId) interesting.add(m.simplybookId);
    }
    const list = Array.from(interesting).slice(0, 60);
    let rpcOk = false;
    for (let i = 0; i < list.length; i += 10) {
      const batch = list.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map((cid) => rpcAdmin<SbClientMembership[]>("getClientMembershipList", [Number(cid)]))
      );
      results.forEach((r, j) => {
        if (r.status === "fulfilled") {
          rpcOk = true;
          if (Array.isArray(r.value)) for (const cm of r.value) applyMembership(batch[j], cm);
        }
      });
      if (!rpcOk) {
        membershipSource = "error: getClientMembershipList failed";
        break;
      }
    }
    if (rpcOk) membershipSource = `JSON-RPC (${list.length} clients checked)`;
  }

  /* 3.5 — Passes sold as SimplyBook Packages: paid invoices embed package
     instances with validity windows and the product name. This is how studios
     that don't use the Membership feature (like this one) sell passes. */
  let packagePasses = 0;
  // Verified on this account: passes are not sold via SimplyBook Packages either
  // (full invoice scan found zero package instances). The scan costs ~2 minutes,
  // so it's opt-in: set SIMPLYBOOK_SCAN_INVOICES=1 to re-enable if the studio
  // ever starts selling passes through SimplyBook.
  if (membershipRows === 0 && process.env.SIMPLYBOOK_SCAN_INVOICES === "1") {
    try {
      const invFrom = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
      const invoices = await sbAll<SbInvoice>(
        `/admin/invoices?filter[datetime_from]=${invFrom}`,
        30
      );
      for (const inv of invoices) {
        if (inv.payment_received === false) continue;
        if ((inv.status || "").toLowerCase().includes("cancel") || (inv.status || "").toLowerCase().includes("refund")) continue;
        for (const pi of inv.package_instances ?? []) {
          const cid = String(pi.client_id ?? inv.client_id ?? "");
          const m = db.members.find((x) => x.simplybookId === cid);
          if (!m || !pi.period_end) continue;
          if (pi.can_be_used === false || (pi.status || "").toLowerCase().includes("cancel")) continue;
          const end = new Date(`${String(pi.period_end).slice(0, 10)}T23:59:59`);
          if (Number.isNaN(end.getTime())) continue;
          if (end.getTime() > new Date(m.membershipExpires).getTime()) {
            m.membershipExpires = end.toISOString();
            m.membershipType = mapMembershipType(pi.package?.name);
          }
          packagePasses++;
        }
      }
      if (packagePasses > 0) membershipSource = `invoices/packages (${invoices.length} invoices scanned)`;
    } catch (e) {
      if (membershipSource === "none")
        membershipSource = `invoice scan error: ${e instanceof Error ? e.message : "failed"}`;
    }
  }

  /* 4 — Activity fallback. This account does not use SimplyBook's Membership
     feature (verified: zero membership rows, empty catalog). Operationally, a
     client with a confirmed recent or upcoming booking IS an active member —
     they could not book otherwise. Grant "Member" status: latest booking + 45 days. */
  let activityMembers = 0;
  if (membershipRows === 0 && packagePasses === 0) {
    const latestByClient = new Map<string, number>();
    for (const b of bookings) {
      const rawStart = b.start_datetime ?? b.start_date_time ?? b.start_date;
      if (!rawStart) continue;
      const canceled =
        (b.status || "").toLowerCase().includes("cancel") ||
        b.is_confirmed === false || b.is_confirmed === 0 || b.is_confirmed === "0" ||
        b.is_confirm === 0 || b.is_confirm === "0";
      if (canceled) continue;
      const cObj = typeof b.client === "object" ? b.client : undefined;
      const cid = String(b.client_id ?? cObj?.id ?? "");
      const t = new Date(rawStart.replace(" ", "T")).getTime();
      if (cid && (!latestByClient.has(cid) || t > latestByClient.get(cid)!)) latestByClient.set(cid, t);
    }
    for (const [cid, latest] of Array.from(latestByClient.entries())) {
      const m = db.members.find((x) => x.simplybookId === cid);
      if (!m) continue;
      const derived = latest + 45 * 86400000;
      if (derived > Date.now() && derived > new Date(m.membershipExpires).getTime()) {
        m.membershipExpires = new Date(derived).toISOString();
        if (new Date(m.joinedAt).getTime() > latest) m.joinedAt = new Date(latest).toISOString();
        m.membershipType = "Member";
        activityMembers++;
      }
    }
  }

  saveDB();
  const activeNow = db.members.filter((m) => new Date(m.membershipExpires).getTime() > Date.now()).length;
  return {
    ok: true,
    message: `Synced ${clients.length} clients (${newMembers} new), ${membershipRows + packagePasses} passes [${membershipSource}], ${bookingRows} new bookings [${bookingSource}]${activityMembers ? `, ${activityMembers} activated via booking activity` : ""}. Active members now: ${activeNow}.`,
    members: clients.length,
    memberships: membershipRows,
    bookings: bookingRows,
  };
}
