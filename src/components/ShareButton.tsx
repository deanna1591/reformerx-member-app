"use client";

import { useState } from "react";

export default function ShareButton({ text, label = "Share" }: { text: string; label?: string }) {
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
    <button onClick={share} className="rounded-full border border-line bg-white px-3 py-1.5 text-[12px] font-semibold active:scale-95">
      {copied ? "Copied ✓" : `↗ ${label}`}
    </button>
  );
}
