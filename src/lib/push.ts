import { getDB, saveDB } from "./store";

/**
 * Web Push sender. Active only when VAPID keys are configured:
 *   npx web-push generate-vapid-keys
 * Then set in .env.local / Vercel:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:info@reformerx.cz)
 * Without keys, in-app notifications still work; push is silently skipped.
 */
export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function sendPush(memberId: string, body: string, url = "/") {
  if (!pushConfigured()) return;
  const db = getDB();
  const subs = db.pushSubs.filter((s) => s.memberId === memberId);
  if (subs.length === 0) return;

  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:info@reformerx.cz",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string
  );

  const payload = JSON.stringify({ title: "ReformerX", body, url });
  let pruned = false;
  await Promise.all(
    subs.map(async (s) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await webpush.sendNotification(s.sub as any, payload);
      } catch (e: unknown) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          db.pushSubs = db.pushSubs.filter((x) => x !== s); // subscription expired
          pruned = true;
        }
      }
    })
  );
  if (pruned) saveDB();
}

/** Fire-and-forget push to every member (announcements, new challenges). */
export async function sendPushToAll(body: string, url = "/") {
  const db = getDB();
  const ids = Array.from(new Set(db.pushSubs.map((s) => s.memberId)));
  await Promise.all(ids.map((id) => sendPush(id, body, url)));
}
