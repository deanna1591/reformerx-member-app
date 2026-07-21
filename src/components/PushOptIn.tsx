"use client";

import { useEffect, useState } from "react";
import { savePushSubscription } from "@/app/actions";

function b64ToU8(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export default function PushOptIn({ vapidKey }: { vapidKey?: string }) {
  const [state, setState] = useState<"unsupported" | "default" | "granted" | "denied" | "loading">("loading");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !vapidKey) {
      setState("unsupported");
      return;
    }
    setState(Notification.permission as "default" | "granted" | "denied");
  }, [vapidKey]);

  const enable = async () => {
    try {
      setState("loading");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToU8(vapidKey as string),
      });
      await savePushSubscription(JSON.parse(JSON.stringify(sub)));
      setState("granted");
    } catch {
      setState(Notification.permission === "denied" ? "denied" : "default");
    }
  };

  if (state === "loading") return null;
  if (state === "unsupported")
    return (
      <p className="text-[12px] text-smoke">
        Push notifications need the installed app (Add to Home Screen) — or aren&apos;t configured yet.
      </p>
    );
  if (state === "granted")
    return <p className="text-[13px] font-medium text-spring-green">Push notifications on ✓</p>;
  if (state === "denied")
    return <p className="text-[12px] text-smoke">Notifications are blocked in your browser settings.</p>;
  return (
    <button onClick={enable} className="rounded-xl bg-ink px-4 py-2.5 text-[13px] font-semibold text-white active:scale-95">
      Turn on push notifications
    </button>
  );
}
