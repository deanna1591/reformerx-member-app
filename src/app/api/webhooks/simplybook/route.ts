import { NextRequest, NextResponse } from "next/server";
import { simplybookConfigured, syncFromSimplybook } from "@/lib/simplybook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * SimplyBook "Ticket callback URL" target.
 * SimplyBook POSTs here on booking create / change / cancel (the toggles in
 * Custom Features → API). Payload shape: { booking_id, booking_hash, company, notification_type }.
 *
 * We don't trust the payload contents — it only acts as a trigger. The actual
 * data is re-fetched from the SimplyBook API with our own credentials, so a
 * forged webhook can't inject anything.
 */
export async function POST(req: NextRequest) {
  if (!simplybookConfigured()) {
    return NextResponse.json({ ok: false, error: "SimplyBook not configured" }, { status: 503 });
  }
  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch {
    /* SimplyBook can also send form-encoded — a trigger is a trigger */
  }
  try {
    const result = await syncFromSimplybook();
    console.log("[simplybook webhook]", JSON.stringify(payload), "→", result.message);
    return NextResponse.json({ ok: true, synced: result.message });
  } catch (e) {
    console.error("[simplybook webhook] sync failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

/** Health check so you can verify the URL in a browser after deploying. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "SimplyBook webhook",
    configured: simplybookConfigured(),
  });
}
