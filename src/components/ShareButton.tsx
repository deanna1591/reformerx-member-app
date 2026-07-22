"use client";

import { useState } from "react";

export default function ShareButton({
  text,
  label = "Share",
  variant = "light",
}: {
  text: string;
  label?: string;
  variant?: "light" | "dark";
}) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const payload = { text, url: typeof window !== "undefined" ? window.location.origin : undefined };
    if (navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch {
        /* user cancelled */
      }
    } else {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <button
      onClick={share}
      className={`rounded-full px-4 py-2 text-[12px] font-semibold transition active:scale-95 ${
        variant === "dark"
          ? "bg-white text-ink"
          : "border border-line bg-white text-ink"
      }`}
    >
      {copied ? "Copied ✓" : `↗ ${label}`}
    </button>
  );
}
