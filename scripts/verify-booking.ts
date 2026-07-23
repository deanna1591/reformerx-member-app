/* Verify SimplyBook in-app booking with a real create + immediate cancel.
 *
 *   npx tsx scripts/verify-booking.ts            → dry run, writes nothing
 *   npx tsx scripts/verify-booking.ts --live     → creates ONE booking, then cancels it
 *
 * Uses your own client record so no member is affected. */
import { readFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].split("#")[0].trim().replace(/^["']|["']$/g, "");
}

const LIVE = process.argv.includes("--live");
const CLIENT_ID = process.argv.find((a) => /^\d+$/.test(a)) ?? "303";
const V2 = "https://user-api-v2.simplybook.it";

async function main() {
  const { ensureDB, getDB } = await import("../src/lib/store");
  const { isoToStudioString, studioDayKey } = await import("../src/lib/time");

  const auth = await fetch(`${V2}/admin/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company: process.env.SIMPLYBOOK_COMPANY,
      login: process.env.SIMPLYBOOK_LOGIN,
      password: process.env.SIMPLYBOOK_USER_KEY,
    }),
  }).then((r) => r.json());
  if (!auth.token) return console.log("AUTH FAILED", auth);
  const H = {
    "Content-Type": "application/json",
    "X-Company-Login": process.env.SIMPLYBOOK_COMPANY as string,
    "X-Token": auth.token,
  };
  console.log("auth ok\n");

  // Pick a class 2–10 days out with a known service and provider
  await ensureDB();
  const db = getDB();
  const now = Date.now();
  const candidate = db.classes
    .filter((c) => {
      const t = new Date(c.startsAt).getTime();
      return t > now + 2 * 86400000 && t < now + 10 * 86400000 && c.serviceId && c.unitId;
    })
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))[0];

  if (!candidate) {
    console.log("No suitable class found (needs serviceId + unitId, 2–10 days out).");
    console.log("Run a sync first: npx tsx scripts/run-sync.ts");
    return;
  }

  const start = new Date(candidate.startsAt);
  const end = new Date(start.getTime() + candidate.durationMin * 60000);
  const payload = {
    start_datetime: isoToStudioString(start.toISOString()),
    end_datetime: isoToStudioString(end.toISOString()),
    service_id: Number(candidate.serviceId),
    provider_id: Number(candidate.unitId),
    client_id: Number(CLIENT_ID),
    count: 1,
  };

  console.log("target class:");
  console.log(`  ${candidate.title} — ${studioDayKey(candidate.startsAt)} ${payload.start_datetime.slice(11, 16)}`);
  console.log(`  service_id=${payload.service_id} provider_id=${payload.provider_id} client_id=${payload.client_id}`);
  console.log("\npayload POST /admin/bookings:");
  console.log(JSON.stringify(payload, null, 1));

  if (!LIVE) {
    console.log("\nDRY RUN — nothing was written.");
    console.log("Re-run with --live to create this booking and cancel it straight away.");
    return;
  }

  console.log("\n--- creating booking ---");
  const res = await fetch(`${V2}/admin/bookings`, { method: "POST", headers: H, body: JSON.stringify(payload) });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(text.slice(0, 600));
  if (!res.ok) {
    console.log("\nBooking FAILED — do not enable SIMPLYBOOK_ALLOW_BOOKING yet.");
    return;
  }

  let body: { id?: number | string; bookings?: Array<{ id?: number | string }> } = {};
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON success */
  }
  const id = body?.id ?? body?.bookings?.[0]?.id;
  console.log(`\nbooking id: ${id ?? "(none returned)"}`);

  if (!id) {
    console.log("No booking id came back — cancel it by hand in SimplyBook if it appeared.");
    return;
  }

  console.log("\n--- cancelling it again ---");
  const del = await fetch(`${V2}/admin/bookings/${id}`, { method: "DELETE", headers: H });
  console.log(`HTTP ${del.status} ${del.ok ? "cancelled" : "CANCEL FAILED — remove it manually in SimplyBook"}`);

  console.log(
    del.ok && res.ok
      ? "\n✅ Round trip works. Safe to set SIMPLYBOOK_ALLOW_BOOKING=1 in .env.local and Vercel."
      : "\n⚠️  Something didn't complete — check the SimplyBook calendar before enabling."
  );
}

main();
