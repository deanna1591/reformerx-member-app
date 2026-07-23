"use client";

import { useEffect, useState } from "react";

/** Chrome fires this before showing its own install banner. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "rx_install_dismissed_at";
const SNOOZE_DAYS = 14;
const DELAY_MS = 4000; // let them look around first

type Labels = {
  title: string;
  body: string;
  install: string;
  later: string;
  iosTitle: string;
  iosStep1: string;
  iosStep2: string;
};

export default function InstallPrompt({ labels }: { labels: Labels }) {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [showIOS, setShowIOS] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Already installed? Nothing to offer.
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari exposes this instead
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    // Recently dismissed?
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (at && Date.now() - at < SNOOZE_DAYS * 86400000) return;
    } catch {
      /* private mode — just show it */
    }

    const ua = window.navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // keep Chrome's own banner away; we show ours
      setDeferred(e as InstallPromptEvent);
      setTimeout(() => setVisible(true), DELAY_MS);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS never fires that event — offer the manual steps instead
    let t: ReturnType<typeof setTimeout> | undefined;
    if (isIOS && isSafari) {
      t = setTimeout(() => {
        setShowIOS(true);
        setVisible(true);
      }, DELAY_MS);
    }

    const onInstalled = () => setVisible(false);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (t) clearTimeout(t);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    setDeferred(null);
    setVisible(false);
    if (choice.outcome === "dismissed") dismiss();
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] mx-auto w-full max-w-md px-4 pb-[max(6.5rem,calc(env(safe-area-inset-bottom)+6rem))]">
      <div className="rise rounded-[22px] bg-ink p-4 text-white shadow-lift">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" className="h-12 w-12 shrink-0 rounded-[12px]" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[17px] leading-tight">{showIOS ? labels.iosTitle : labels.title}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-white/70">{labels.body}</p>
          </div>
          <button
            onClick={dismiss}
            aria-label={labels.later}
            className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-white/50 transition hover:text-white"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {showIOS ? (
          <ol className="mt-3 space-y-1.5 border-t border-white/15 pt-3 text-[12.5px] text-white/80">
            <li className="flex items-center gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/15 text-[11px] font-semibold">1</span>
              <span className="flex items-center gap-1.5">
                {labels.iosStep1}
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 15V3m0 0L8 7m4-4 4 4M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
                </svg>
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/15 text-[11px] font-semibold">2</span>
              <span>{labels.iosStep2}</span>
            </li>
          </ol>
        ) : (
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <button
              onClick={install}
              className="rounded-xl bg-sage py-2.5 text-[14px] font-semibold text-ink transition active:scale-[0.98]"
            >
              {labels.install}
            </button>
            <button onClick={dismiss} className="rounded-xl border border-white/20 px-4 text-[13px] font-medium text-white/70">
              {labels.later}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
