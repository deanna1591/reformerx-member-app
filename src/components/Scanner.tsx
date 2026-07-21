"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { checkInAction } from "@/app/actions";
import type { CheckInResult } from "@/lib/engine";

export default function Scanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");
  const stopRef = useRef<() => void>(() => {});

  const submit = async (code: string) => {
    if (busy) return;
    setBusy(true);
    stopRef.current();
    const res = await checkInAction(code);
    setResult(res);
    setBusy(false);
    if (res.ok && "vibrate" in navigator) navigator.vibrate?.(80);
  };

  const startCamera = async () => {
    setCameraError(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setScanning(true);

      let raf = 0;
      const tick = () => {
        const canvas = canvasRef.current;
        if (video.readyState === video.HAVE_ENOUGH_DATA && canvas) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(video, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            submit(code.data);
            return;
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      stopRef.current = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        setScanning(false);
      };
    } catch {
      setCameraError("Camera unavailable. You can type the code from the poster instead.");
    }
  };

  useEffect(() => () => stopRef.current(), []);

  if (result) {
    return (
      <div className={`relative overflow-hidden rounded-[22px] p-6 pt-9 text-center ${result.ok ? "bg-ink text-white" : "border border-spring-red/30 bg-spring-red/5"}`}>
        {result.ok && (
          <>
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-140px] h-[300px] w-[300px] -translate-x-1/2 rounded-full border border-sage/25" />
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-140px] h-[230px] w-[230px] -translate-x-1/2 rounded-full border border-sage/15" />
          </>
        )}
        {result.ok ? (
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-sage text-[22px] text-ink">✓</span>
        ) : (
          <p className="text-4xl">🚫</p>
        )}
        <p className={`mt-3 text-[15px] font-semibold ${result.ok ? "text-white" : ""}`}>{result.message}</p>
        {result.completedChallenges.map((c, i) => (
          <div key={c} className="mt-4 overflow-hidden rounded-[18px] bg-chalk text-left text-ink">
            <div className="flex items-center gap-3 p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink text-[20px]">{(result.earnedRewards[i] ?? "🎁").split(" ")[0]}</span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tan-deep">Challenge complete · reward unlocked</p>
                <p className="truncate font-display text-[17px]">{c.replace(/^\S+\s/, "")}</p>
                {result.earnedRewards[i] && <p className="text-[12px] font-semibold">{result.earnedRewards[i]}</p>}
              </div>
            </div>
            <div className="mx-3 border-t-2 border-dashed border-[#C9C6B8]" />
            <p className="px-4 py-2.5 text-[11.5px] text-[#55533F]">The studio is preparing it — you&apos;ll get a ping when it&apos;s at reception.</p>
          </div>
        ))}
        {result.newBadges.map((b) => (
          <p key={b} className={`mt-2 rounded-full px-3 py-2 text-[13px] font-semibold ${result.ok ? "bg-white/10 text-sage" : "border border-line bg-chalk"}`}>
            New badge: {b}
          </p>
        ))}
        <button
          onClick={() => {
            setResult(null);
          }}
          className={`mt-5 rounded-full px-6 py-2.5 font-display text-[13px] tracking-[0.14em] ${result.ok ? "border border-sage/50 text-sage" : "border border-line bg-white font-sans font-semibold"}`}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-square overflow-hidden rounded-xl2 bg-ink shadow-card">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        {!scanning && (
          <button
            onClick={startCamera}
            className="absolute inset-0 grid place-items-center text-white"
          >
            <span className="rounded-2xl bg-ink px-6 py-3.5 text-[15px] font-semibold shadow-lift">
              📷 Open camera & scan
            </span>
          </button>
        )}
        {scanning && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-52 w-52 rounded-3xl border-[3px] border-white/80 shadow-[0_0_0_9999px_rgba(25,22,33,0.45)]" />
          </div>
        )}
      </div>
      {cameraError && <p className="text-center text-[14px] text-spring-red">{cameraError}</p>}
      <div className="rounded-xl2 bg-card p-4 shadow-card">
        <label htmlFor="manual">No camera? Enter the code from the studio poster</label>
        <div className="mt-2 flex gap-2">
          <input
            id="manual"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="RX-STUDIO-CHECKIN"
            autoCapitalize="characters"
          />
          <button
            onClick={() => manual && submit(manual)}
            disabled={busy || !manual}
            className="shrink-0 rounded-xl bg-ink px-4 text-[14px] font-semibold text-white disabled:opacity-40"
          >
            {busy ? "…" : "Go"}
          </button>
        </div>
      </div>
    </div>
  );
}
