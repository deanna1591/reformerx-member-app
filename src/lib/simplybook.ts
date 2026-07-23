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
import { studioToISO, isoToStudioString, studioDayKey } from "./time";
import type { Member, MembershipType , DB } from "./types";

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

async function sb<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Company-Login": process.env.SIMPLYBOOK_COMPANY as string,
      "X-Token": token,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (res.status === 401 && retry) {
    cachedToken = null; // token expired → retry once
    return sb<T>(path, init, false);
  }
  if (!res.ok) throw new Error(`SimplyBook ${path} failed (${res.status}): ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : ({} as T)) as T;
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
  registration_date?: string;
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

interface SbInvoiceLine {
  price?: number | string;
  type?: string; // "booking" | "package" | "membership" | ...
  name?: string;
  object_name?: string;
  description_string?: string; // e.g. "Balíček: Monthly Unlimited (21-07-2026 - 20-08-2026) x1 4900.00 CZK"
  period_start?: string;
  package_id?: number;
}

interface SbInvoice {
  id: number | string;
  client_id?: number | string;
  datetime?: string;
  payment_received?: boolean;
  status?: string; // "paid" | "cancelled" | "cancelled_by_timeout" | ...
  lines?: SbInvoiceLine[];
  package_instances?: SbPackageInstance[];
}


/** Normalised name key for matching instructors across sources. */
function instructorKey(name: string): string {
  return name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function stripHtml(html?: string): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return text.length ? text.slice(0, 600) : undefined;
}

function providerPhotoUrl(p: { picture_path?: string; picture_preview?: string; picture?: string }): string | undefined {
  const rel = p.picture_path ?? p.picture_preview;
  if (rel) return rel.startsWith("http") ? rel : `https://simplybook.it${rel}`;
  if (p.picture) return `https://simplybook.it/uploads/${(process.env.SIMPLYBOOK_COMPANY ?? "").trim()}/image_files/preview/${p.picture}`;
  return undefined;
}

/** Fold duplicate instructor records (seed / name-keyed / id-keyed) into one. */
export function mergeDuplicateInstructors(db: DB): number {
  const byKey = new Map<string, typeof db.instructors[number]>();
  const classCount = (id: string) => db.classes.filter((c) => c.instructorId === id).length;
  let merged = 0;

  for (const inst of [...db.instructors]) {
    const key = instructorKey(inst.name);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, inst);
      continue;
    }
    // Winner: the one linked to SimplyBook, else the one with more classes
    const [keep, drop] =
      existing.simplybookUnitId && !inst.simplybookUnitId
        ? [existing, inst]
        : inst.simplybookUnitId && !existing.simplybookUnitId
        ? [inst, existing]
        : classCount(existing.id) >= classCount(inst.id)
        ? [existing, inst]
        : [inst, existing];

    // Carry over anything the winner is missing
    keep.photoUrl = keep.photoUrl ?? drop.photoUrl;
    keep.bio = keep.bio ?? drop.bio;
    keep.email = keep.email ?? drop.email;
    keep.pinHash = keep.pinHash ?? drop.pinHash;
    keep.staffRole = keep.staffRole ?? drop.staffRole;
    keep.simplybookUnitId = keep.simplybookUnitId ?? drop.simplybookUnitId;
    if (keep.role === "Instructor" && drop.role && drop.role !== "Instructor") keep.role = drop.role;

    for (const c of db.classes) if (c.instructorId === drop.id) c.instructorId = keep.id;
    db.instructors = db.instructors.filter((x) => x.id !== drop.id);
    byKey.set(key, keep);
    merged++;
  }
  return merged;
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
        joinedAt: c.registration_date ? studioToISO(c.registration_date) : new Date().toISOString(),
        qrCode: `RXM-${sbId}-${Math.floor(1000 + Math.random() * 9000)}`,
        simplybookId: sbId,
      } satisfies Member;
      db.members.push(m);
      newMembers++;
    } else {
      m.simplybookId = sbId;
      if (c.name) m.name = c.name;
      // Back-date "member since" when SimplyBook knows they registered earlier
      if (c.registration_date) {
        const reg = studioToISO(c.registration_date);
        if (new Date(reg).getTime() < new Date(m.joinedAt).getTime()) m.joinedAt = reg;
      }
    }
  }


  /* 2.5 — providers → instructors (canonical names, bios and photos) */
  let instructorRows = 0;
  try {
    const providers = await sbAll<{
      id: number; name: string; description?: string; picture?: string; picture_path?: string;
      picture_preview?: string; is_active?: boolean; email?: string;
    }>("/admin/providers", 5);
    for (const pr of providers) {
      const unitId = String(pr.id);
      let inst =
        db.instructors.find((i) => i.simplybookUnitId === unitId) ??
        db.instructors.find((i) => i.id === `i-sb-${unitId}`) ??
        db.instructors.find((i) => instructorKey(i.name) === instructorKey(pr.name));
      if (!inst) {
        inst = { id: `i-sb-${unitId}`, name: pr.name, role: "Instructor" };
        db.instructors.push(inst);
      }
      inst.simplybookUnitId = unitId;
      inst.name = pr.name || inst.name;
      // Never clobber what the studio typed in the dashboard
      if (!inst.bio) inst.bio = stripHtml(pr.description);
      if (!inst.photoUrl) inst.photoUrl = providerPhotoUrl(pr);
      if (pr.is_active === false) inst.active = false;
      instructorRows++;
    }
  } catch {
    /* provider list is a bonus — the sync continues without it */
  }
  const mergedInstructors = mergeDuplicateInstructors(db);

  // Coaches who no longer exist in SimplyBook and haven't taught for 90 days are
  // hidden from booking filters. Their class history is kept intact.
  if (instructorRows > 0) {
    const cutoff = Date.now() - 90 * 86400000;
    for (const inst of db.instructors) {
      if (inst.simplybookUnitId || inst.active === false) continue;
      const taughtRecently = db.classes.some(
        (c) => c.instructorId === inst.id && new Date(c.startsAt).getTime() > cutoff
      );
      if (!taughtRecently) inst.active = false;
    }
  }

  /* Provider capacity, fetched once and reused by both booking import and timetable */
  const providerCapacity = new Map<string, number>();
  try {
    const prs = await sbAll<{ id: number; qty?: number }>("/admin/providers", 5);
    for (const pr of prs) if (typeof pr.qty === "number" && pr.qty > 0) providerCapacity.set(String(pr.id), pr.qty);
  } catch {
    /* capacity stays unknown — classes simply never show as full */
  }

  /* 3 — bookings (yesterday → +14d) → classes + bookings */
  const bookingDays = Math.max(7, Number(process.env.SIMPLYBOOK_BOOKING_DAYS ?? 45) || 45);
  const from = new Date(Date.now() - bookingDays * 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  let bookings: SbBooking[] = [];
  let bookingSource = "none";
  // Fetch in ~30-day chunks: a single wide call can be silently truncated by the
  // API, which is what made lifetime class counts read low.
  try {
    const seen = new Set<string>();
    const startMs = new Date(`${from}T00:00:00`).getTime();
    const endMs = new Date(`${to}T23:59:59`).getTime();
    const CHUNK = 30 * 86400000;
    let chunks = 0;
    for (let cursor = startMs; cursor <= endMs && chunks < 60; cursor += CHUNK, chunks++) {
      const cFrom = new Date(cursor).toISOString().slice(0, 10);
      const cTo = new Date(Math.min(cursor + CHUNK - 86400000, endMs)).toISOString().slice(0, 10);
      const rows = await rpcAdmin<SbBooking[]>("getBookings", [
        { date_from: cFrom, date_to: cTo, order: "start_date" },
      ]);
      if (!Array.isArray(rows)) continue;
      for (const r of rows) {
        const key = String(r.id ?? `${r.client_id}-${r.start_date ?? r.start_datetime}`);
        if (seen.has(key)) continue;
        seen.add(key);
        bookings.push(r);
      }
    }
    if (bookings.length > 0) bookingSource = `JSON-RPC ×${chunks}`;
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
    // Confirmed-only: SimplyBook keeps cancelled rows in the feed (this account
    // has ~60% cancellations), and counting them inflated lifetime class totals.
    const statusText = (b.status || "").toLowerCase();
    const confirmFlag = b.is_confirm ?? b.is_confirmed;
    const canceled =
      statusText.includes("cancel") ||
      confirmFlag === false || confirmFlag === 0 || confirmFlag === "0" ||
      (statusText !== "" && statusText !== "confirmed" && statusText !== "approved" && !statusText.includes("pend"));
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
    const startsAt = studioToISO(rawStart);
    const serviceId = b.service?.id ?? b.event_id ?? "x";
    const classKey = `c-sb-${serviceId}-${startsAt}`;
    let cls = db.classes.find((x) => x.id === classKey);
    if (!cls) {
      const provName = b.provider?.name ?? b.unit;
      const provUnitId = b.provider?.id ? String(b.provider.id) : b.unit_id ? String(b.unit_id) : undefined;
      let instructor =
        (provUnitId ? db.instructors.find((i) => i.simplybookUnitId === provUnitId || i.id === `i-sb-${provUnitId}`) : undefined) ??
        (provName ? db.instructors.find((i) => instructorKey(i.name) === instructorKey(provName)) : undefined);
      if (!instructor && provName) {
        instructor = {
          id: provUnitId ? `i-sb-${provUnitId}` : `i-name-${instructorKey(provName).replace(/[^a-z0-9]+/g, "-")}`,
          name: provName,
          role: "Instructor",
          simplybookUnitId: provUnitId,
        };
        db.instructors.push(instructor);
      }
      if (instructor && provUnitId && !instructor.simplybookUnitId) instructor.simplybookUnitId = provUnitId;

      const rawEnd = b.end_datetime ?? b.end_date_time ?? b.end_date;
      const provQty = provUnitId ? providerCapacity.get(provUnitId) : undefined;
      const durationMin = b.duration
        ? Math.max(20, Number(b.duration))
        : b.event_duration
        ? Math.max(20, Number(b.event_duration) || 50)
        : rawEnd
        ? Math.max(30, Math.round((new Date(studioToISO(rawEnd)).getTime() - new Date(studioToISO(rawStart)).getTime()) / 60000))
        : 55;
      cls = {
        id: classKey,
        serviceId: serviceId === "x" ? undefined : String(serviceId),
        unitId: b.provider?.id ? String(b.provider.id) : b.unit_id ? String(b.unit_id) : undefined,
        title: b.service?.name || b.event || "Reformer Class",
        instructorId: instructor?.id ?? db.instructors[0].id,
        startsAt,
        durationMin,
        capacity: provQty,
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

  /* 3.4 — Published timetable. IMPORTANT: skip_min_max_restriction must stay 0.
     With it set, SimplyBook returns every theoretically bookable slot in the
     provider's working hours rather than the actual class schedule, which
     fabricated classes that don't exist. We also prune future classes that the
     timetable no longer contains, so cancelled or rescheduled sessions vanish
     from the app instead of lingering. */
  let timetableSlots = 0;
  let prunedClasses = 0;
  if (process.env.SIMPLYBOOK_SYNC_TIMETABLE !== "0") {
    try {
      const services = await sbAll<{
        id: number; name: string; duration?: number; providers?: number[]; is_active?: boolean; is_visible?: boolean;
        limit_booking?: number | null; min_group_booking?: number | null;
      }>("/admin/services", 5);
      const capacityOf = new Map<string, number>();
      for (const svc of services) {
        if (typeof svc.limit_booking === "number" && svc.limit_booking > 0) {
          capacityOf.set(String(svc.id), svc.limit_booking);
        }
      }
      let providers: Array<{ id: number; name: string; qty?: number }> = [];
      try {
        providers = await sbAll<{ id: number; name: string; qty?: number }>("/admin/providers", 5);
      } catch {
        /* names fall back to what bookings taught us */
      }
      // Capacity lives on the provider: qty = how many clients can be served at
      // once (the studio's reformers / mats / bikes). The service-level
      // limit_booking is a fallback when a provider has no qty set.
      const providerQty = new Map<string, number>();
      for (const pr of providers) {
        if (typeof pr.qty === "number" && pr.qty > 0) providerQty.set(String(pr.id), pr.qty);
      }

      const horizonDays = Math.max(1, Number(process.env.SIMPLYBOOK_TIMETABLE_DAYS ?? 21) || 21);
      const tFrom = studioDayKey(new Date());
      const tTo = studioDayKey(new Date(Date.now() + horizonDays * 86400000));
      const seenClassIds = new Set<string>();
      let calls = 0;
      let timetableOk = false;

      for (const svc of services.filter((x) => x.is_active !== false)) {
        for (const pid of (svc.providers ?? []).length ? svc.providers! : [undefined]) {
          if (calls >= 60) break;
          calls++;
          const q = new URLSearchParams({
            service_id: String(svc.id),
            date_from: tFrom,
            date_to: tTo,
            count: "1",
            skip_min_max_restriction: "0",
            with_available_slots: "1",
          });
          if (pid) q.set("provider_id", String(pid));
          let days: Array<{ date?: string; slots?: Array<{ time?: string; available_count?: number }> }> = [];
          try {
            days = await sb<typeof days>(`/admin/timeline/slots?${q.toString()}`);
            timetableOk = true;
          } catch {
            continue;
          }

          for (const day of days ?? []) {
            for (const slot of day.slots ?? []) {
              if (!day.date || !slot.time) continue;
              const time = slot.time.length === 5 ? `${slot.time}:00` : slot.time;
              const startsAt = studioToISO(`${day.date} ${time}`);
              if (Number.isNaN(new Date(startsAt).getTime())) continue;
              const classId = `c-sb-${svc.id}-${startsAt}`;
              seenClassIds.add(classId);

              let instructorId: string | undefined;
              if (pid) {
                const nm = providers.find((x) => Number(x.id) === Number(pid))?.name;
                const existing =
                  db.instructors.find((i) => i.simplybookUnitId === String(pid)) ??
                  db.instructors.find((i) => i.id === `i-sb-${pid}`) ??
                  (nm ? db.instructors.find((i) => instructorKey(i.name) === instructorKey(nm)) : undefined);
                if (existing) {
                  existing.simplybookUnitId = existing.simplybookUnitId ?? String(pid);
                  instructorId = existing.id;
                } else {
                  instructorId = `i-sb-${pid}`;
                  db.instructors.push({ id: instructorId, name: nm || "ReformerX", role: "Instructor", simplybookUnitId: String(pid) });
                }
              }

              const existingClass = db.classes.find((c) => c.id === classId);
              const cap = (pid ? providerQty.get(String(pid)) : undefined) ?? capacityOf.get(String(svc.id));
              if (existingClass) {
                existingClass.capacity = cap ?? existingClass.capacity;
                existingClass.serviceId = String(svc.id);
                if (pid) existingClass.unitId = String(pid);
                if (instructorId) existingClass.instructorId = instructorId;
              } else {
                db.classes.push({
                  id: classId,
                  title: svc.name || "Reformer Class",
                  instructorId: instructorId ?? db.instructors[0]?.id ?? "i-karolina",
                  startsAt,
                  durationMin: svc.duration && svc.duration > 0 ? svc.duration : 50,
                  serviceId: String(svc.id),
                  unitId: pid ? String(pid) : undefined,
                  capacity: cap,
                });
                timetableSlots++;
              }
            }
          }
        }
      }

      // Prune future classes SimplyBook no longer lists — unless somebody is
      // booked into them (those stay so the member's booking isn't orphaned).
      if (timetableOk && seenClassIds.size > 0) {
        const horizonMs = Date.now() + horizonDays * 86400000;
        const keep = db.classes.filter((c) => {
          const t = new Date(c.startsAt).getTime();
          if (t <= Date.now() || t > horizonMs) return true; // past or beyond horizon
          if (seenClassIds.has(c.id)) return true; // still on the timetable
          if (db.bookings.some((b) => b.classId === c.id)) return true; // someone is booked
          return false;
        });
        prunedClasses = db.classes.length - keep.length;
        db.classes = keep;
      }
    } catch {
      /* timetable is a bonus — never fail the sync over it */
    }
  }

  /* 3.5 — Passes sold as SimplyBook Packages. Verified on this account:
     purchases appear as PAID invoice lines with type "package", carrying the
     product name and validity window in description_string, e.g.
     "Balíček: Monthly Unlimited (21-07-2026 - 20-08-2026) x1 4900.00 CZK".
     (package_instances stays empty on this account — don't rely on it.)
     Default window: 60 days per sync (fast, catches new purchases).
     Set SIMPLYBOOK_SCAN_INVOICES=1 once for a 400-day backfill. */
  let packagePasses = 0;
  const catalog = new Map<string, NonNullable<DB["packages"]>[number]>();
  // Best (latest-ending) real pass per member. Applied after the scan so it
  // overrides any activity-derived estimate, even when it ends sooner.
  const bestPass = new Map<string, { end: Date; start?: string; name?: string; credits?: number }>();
  if (membershipRows === 0) {
    try {
      const backfill = process.env.SIMPLYBOOK_SCAN_INVOICES === "1";
      const invDays = backfill ? 400 : 120;
      const invFrom = new Date(Date.now() - invDays * 86400000).toISOString().slice(0, 10);
      const invoices = await sbAll<SbInvoice>(
        `/admin/invoices?filter[datetime_from]=${invFrom}`,
        backfill ? 200 : 16
      );
      const period = /\((\d{2})-(\d{2})-(\d{4})\s*-\s*(\d{2})-(\d{2})-(\d{4})\)/;
      const namePrefix = /^[^:]{0,30}:\s*(.+?)\s*\(/;
      for (const inv of invoices) {
        const paid = inv.status === "paid" || inv.payment_received === true;
        if (!paid) continue;
        for (const line of inv.lines ?? []) {
          if (line.type !== "package" && line.type !== "membership") continue;
          const cid = String(inv.client_id ?? "");
          const m = db.members.find((x) => x.simplybookId === cid);
          if (!m) continue;
          const desc = line.description_string ?? "";
          const pm = period.exec(desc);
          let end: Date | null = null;
          if (pm) end = new Date(`${pm[6]}-${pm[5]}-${pm[4]}T23:59:59`);
          else if (line.period_start) end = new Date(new Date(`${line.period_start}T00:00:00`).getTime() + 31 * 86400000);
          if (!end || Number.isNaN(end.getTime())) continue;
          const productName = namePrefix.exec(desc)?.[1] || line.name || line.object_name;
          const prev = bestPass.get(m.id);
          if (!prev || end.getTime() > prev.end.getTime()) {
            const creditMatch = productName ? /(\d+)\s*(?:x|classes|lekc|vstup)/i.exec(productName) : null;
            bestPass.set(m.id, {
              end,
              start: pm
                ? new Date(`${pm[3]}-${pm[2]}-${pm[1]}T00:00:00`).toISOString()
                : line.period_start
                ? studioToISO(`${line.period_start} 00:00:00`)
                : undefined,
              name: productName?.trim() || undefined,
              credits: creditMatch ? Number(creditMatch[1]) : undefined,
            });
          }
          packagePasses++;

          // Catalogue the product so the in-app store can show real passes.
          // Studios sell merchandise through Packages too (grip socks, bottles) —
          // those are not passes and shouldn't sit next to memberships.
          const MERCH = /(ponožk|ponozk|sock|láhev|lahev|bottle|tričk|tricko|shirt|merch|taška|bag|ručník|rucnik|towel)/i;
          if (productName && !MERCH.test(productName)) {
            const price = typeof line.price === "number" ? line.price : Number(line.price ?? 0);
            const pkgId = `pkg-${line.package_id ?? productName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            const known = catalog.get(pkgId);
            const days = pm ? Math.round((end.getTime() - new Date(`${pm[3]}-${pm[2]}-${pm[1]}T00:00:00`).getTime()) / 86400000) : undefined;
            if (!known || (price > 0 && known.price === 0)) {
              catalog.set(pkgId, {
                id: pkgId,
                name: productName,
                price: price || known?.price || 0,
                currency: "CZK",
                validityDays: days && days > 0 ? days : known?.validityDays,
                classes: /(\d+)\s*(?:x|classes|lekc)/i.exec(productName) ? Number(/(\d+)/.exec(productName)![1]) : known?.classes,
              });
            }
          }
        }
      }
      for (const [memberId, pass] of Array.from(bestPass.entries())) {
        const m = db.members.find((x) => x.id === memberId);
        if (!m) continue;
        m.membershipExpires = pass.end.toISOString(); // authoritative, even if earlier
        m.membershipType = mapMembershipType(pass.name);
        m.passName = pass.name;
        m.passStart = pass.start;
        m.passCredits = pass.credits;
      }
      membershipSource = `invoice package lines (${invoices.length} invoices, ${invDays}d window)`;
      if (catalog.size > 0) {
        // Drop merchandise catalogued by earlier syncs, not just new entries
        const MERCH_CLEAN = /(ponožk|ponozk|sock|láhev|lahev|bottle|tričk|tricko|shirt|merch|taška|bag|ručník|rucnik|towel)/i;
        const merged = new Map(
          (db.packages ?? []).filter((p) => !MERCH_CLEAN.test(p.name)).map((p) => [p.id, p])
        );
        for (const [k, v] of Array.from(catalog.entries())) merged.set(k, v);
        db.packages = Array.from(merged.values()).sort((a, b) => a.price - b.price);
      }
    } catch (e) {
      membershipSource = `invoice scan error: ${e instanceof Error ? e.message : "failed"}`;
    }
  }

  /* 4 — Activity fallback. This account does not use SimplyBook's Membership
     feature (verified: zero membership rows, empty catalog). Operationally, a
     client with a confirmed recent or upcoming booking IS an active member —
     they could not book otherwise. Grant "Member" status: latest booking + 45 days. */
  let activityMembers = 0;
  {
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

      // A genuine pass (from SimplyBook) is authoritative — never stretch its
      // expiry with a booking-activity estimate, even when the pass ends sooner.
      const pass = bestPass.get(m.id);
      const hasRealPass = Boolean(pass && pass.end.getTime() > Date.now());
      if (new Date(m.joinedAt).getTime() > latest) m.joinedAt = new Date(latest).toISOString();
      if (hasRealPass) continue;

      const derived = latest + 45 * 86400000;
      if (derived > Date.now() && derived > new Date(m.membershipExpires).getTime()) {
        m.membershipExpires = new Date(derived).toISOString();
        m.membershipType = "Member";
        m.passName = undefined;
        activityMembers++;
      }
    }
  }

  /* 5 — Spots remaining. SimplyBook's slot feed returns available_count: null on
     this account, so capacity comes from the service's booking limit and the
     count of confirmed bookings we already hold. Classes without a configured
     limit stay open-ended (never "full"). */
  let fullClasses = 0;
  {
    const bookedPerClass = new Map<string, number>();
    for (const b of db.bookings) bookedPerClass.set(b.classId, (bookedPerClass.get(b.classId) ?? 0) + 1);
    for (const c of db.classes) {
      if (typeof c.capacity !== "number" || c.capacity <= 0) {
        c.spotsLeft = undefined; // unknown capacity → never shown as full
        continue;
      }
      c.spotsLeft = Math.max(0, c.capacity - (bookedPerClass.get(c.id) ?? 0));
      if (c.spotsLeft === 0 && new Date(c.startsAt).getTime() > Date.now()) fullClasses++;
    }
  }

  saveDB();
  const activeNow = db.members.filter((m) => new Date(m.membershipExpires).getTime() > Date.now()).length;
  return {
    ok: true,
    message: `Synced ${clients.length} clients (${newMembers} new), ${membershipRows + packagePasses} passes [${membershipSource}], ${instructorRows} coaches${mergedInstructors ? ` (${mergedInstructors} merged)` : ""}, ${bookingRows} new bookings [${bookingSource}, ${bookingDays}d], ${timetableSlots} timetable slots${fullClasses ? `, ${fullClasses} full` : ""}${prunedClasses ? `, ${prunedClasses} stale classes removed` : ""}${activityMembers ? `, ${activityMembers} activated via booking activity` : ""}. Active members now: ${activeNow}.`,
    members: clients.length,
    memberships: membershipRows,
    bookings: bookingRows,
  };
}

/* ----------------------------- booking writes -----------------------------
   Creating real reservations in SimplyBook. Disabled unless
   SIMPLYBOOK_ALLOW_BOOKING=1, so nothing writes to the studio's live calendar
   until the call has been verified against this account (scripts/sb-probe3.mjs).
   Until then the app deep-links members to the SimplyBook booking page.       */

export function inAppBookingEnabled(): boolean {
  return process.env.SIMPLYBOOK_ALLOW_BOOKING === "1" && simplybookConfigured();
}

/** Public booking page for a service, used as the fallback "Reserve" target. */
export function simplybookBookingUrl(serviceId?: string, startsAt?: string): string {
  const base = (process.env.NEXT_PUBLIC_SIMPLYBOOK_BOOKING_URL ?? "https://rezervace.reformerx.cz/v2/").replace(/\/$/, "");
  const date = startsAt ? new Date(startsAt).toISOString().slice(0, 10) : "";
  if (serviceId) return `${base}/#book/service/${serviceId}${date ? `/date/${date}` : ""}`;
  return `${base}/#book`;
}

export function simplybookPackagesUrl(): string {
  const base = (process.env.NEXT_PUBLIC_SIMPLYBOOK_BOOKING_URL ?? "https://rezervace.reformerx.cz/v2/").replace(/\/$/, "");
  return `${base}/#packages`;
}

export async function createSimplybookBooking(opts: {
  clientId: string;
  serviceId: string;
  unitId?: string;
  startsAt: string;
  durationMin?: number;
}): Promise<{ ok: boolean; id?: string; message: string }> {
  if (!inAppBookingEnabled()) return { ok: false, message: "In-app booking is not enabled." };
  const fmt = (d: Date) => isoToStudioString(d.toISOString());
  const start = new Date(opts.startsAt);
  const end = new Date(start.getTime() + (opts.durationMin ?? 50) * 60000);
  try {
    // POST /admin/bookings — AdminBookingBuildEntity
    const res = await sb<{ id?: number | string; bookings?: Array<{ id?: number | string }> }>("/admin/bookings", {
      method: "POST",
      body: JSON.stringify({
        start_datetime: fmt(start),
        end_datetime: fmt(end),
        service_id: Number(opts.serviceId),
        provider_id: opts.unitId ? Number(opts.unitId) : undefined,
        client_id: Number(opts.clientId),
        count: 1,
      }),
    });
    const id = res?.id ?? res?.bookings?.[0]?.id;
    return { ok: true, id: id ? String(id) : undefined, message: "Reserved." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Booking failed." };
  }
}

export async function cancelSimplybookBooking(bookingId: string): Promise<{ ok: boolean; message: string }> {
  if (!inAppBookingEnabled()) return { ok: false, message: "In-app booking is not enabled." };
  try {
    await sb(`/admin/bookings/${encodeURIComponent(bookingId)}`, { method: "DELETE" });
    return { ok: true, message: "Cancelled." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Cancel failed." };
  }
}
