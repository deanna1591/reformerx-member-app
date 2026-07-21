"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export default function QRDisplay({ value, size = 220 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current)
      QRCode.toCanvas(ref.current, value, {
        width: size,
        margin: 1,
        color: { dark: "#171310", light: "#ffffff" },
      });
  }, [value, size]);
  return <canvas ref={ref} className="rounded-xl" aria-label={`QR code: ${value}`} />;
}
