import { NextRequest, NextResponse } from "next/server";
import { ensureDB, getDB } from "@/lib/store";
import { isStaff } from "@/lib/staff";
import { studioDayKey } from "@/lib/time";
import { attendedClasses } from "@/lib/engine";

export const dynamic = "force-dynamic";

type Status = "active" | "expired" | "none";

/** Excel is strict about this: quote everything, double inner quotes. */
function cell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Exports exactly the rows the admin list is currently showing, by re-applying
 * the same q/status/type filters from the query string. Anything else would be
 * a quiet lie — the button says "export these members".
 *
 * CSV rather than .xlsx so no new dependency is needed; Excel opens it directly.
 * The UTF-8 BOM matters here: without it Excel mangles Czech diacritics.
 */
export async function GET(req: NextRequest) {
  // This lives under /api, so the /admin middleware guard does not cover it.
  if (!isStaff()) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  await ensureDB();
  const db = getDB();
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim();
  const status = sp.get("status") ?? "all";
  const type = sp.get("type") ?? "all";

  const statusOf = (m: (typeof db.members)[number]): Status => {
    if (!m.membershipExpires) return "none";
    return new Date(m.membershipExpires).getTime() >= Date.now() ? "active" : "expired";
  };

  let list = db.members.slice();
  if (q) {
    const nq = q.toLowerCase();
    list = list.filter(
      (m) =>
        m.name.toLowerCase().includes(nq) ||
        m.email.toLowerCase().includes(nq) ||
        m.qrCode.toLowerCase().includes(nq)
    );
  }
  if (status !== "all") list = list.filter((m) => statusOf(m) === status);
  if (type !== "all") list = list.filter((m) => m.membershipType === type);
  list.sort((a, b) => a.name.localeCompare(b.name));

  const header = [
    "Name", "Email", "Status", "Membership type", "Pass name",
    "Pass expires", "Credits left", "Joined", "Classes attended",
    "Last class", "Badges", "QR code", "SimplyBook ID",
  ];

  const rows = list.map((m) => {
    const attended = attendedClasses(m.id);
    const last = attended.length ? attended[attended.length - 1].at : "";
    const badges = db.earnedBadges.filter((b) => b.memberId === m.id).length;
    return [
      m.name,
      m.email,
      statusOf(m),
      m.membershipType,
      m.passName ?? "",
      m.membershipExpires ? studioDayKey(m.membershipExpires) : "",
      m.passCredits ?? "",
      m.joinedAt ? studioDayKey(m.joinedAt) : "",
      attended.length,
      last ? studioDayKey(last) : "",
      badges,
      m.qrCode,
      m.simplybookId ?? "",
    ];
  });

  const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const stamp = studioDayKey(new Date());
  const label = [status !== "all" ? status : null, type !== "all" ? type : null, q ? "search" : null]
    .filter(Boolean)
    .join("-");
  const filename = `reformerx-members-${label ? label + "-" : ""}${stamp}.csv`;

  return new NextResponse("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
