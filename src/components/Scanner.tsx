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
      <div className={`rounded-xl2 p-6 text-center shadow-card ${result.ok ? "bg-spring-green/10" : "bg-spring-red/10"}`}>
        <p className="text-4xl">{result.ok ? "✅" : "🚫"}</p>
        <p className="mt-3 text-[16px] font-semibold">{result.message}</p>
        {result.pointsEarned > 0 && (
          <p className="mt-2 text-[14px] text-smoke">+{result.pointsEarned} points</p>
        )}
        {result.completedChallenges.map((c) => (
          <p key={c} className="mt-2 rounded-xl bg-white px-3 py-2 text-[14px] font-semibold shadow-card">
            🎉 Challenge complete: {c}
          </p>
        ))}
        {result.newBadges.map((b) => (
          <p key={b} className="mt-2 rounded-xl bg-white px-3 py-2 text-[14px] font-semibold shadow-card">
            New badge: {b}
          </p>
        ))}
        <button
          onClick={() => {
            setResult(null);
          }}
          className="mt-4 rounded-xl border border-line bg-white px-4 py-2.5 text-[14px] font-semibold"
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
            <span className="rounded-2xl bg-plum px-6 py-3.5 text-[15px] font-semibold shadow-lift">
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
