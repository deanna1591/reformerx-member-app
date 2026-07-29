"use client";

import { useEffect, useState } from "react";

type Badge = { id: string; name: string; emoji: string; imageUrl?: string; description: string };

/**
 * Plays once when a member opens the home screen holding a badge they haven't
 * seen yet, then calls the server action to mark it celebrated so it never
 * replays. Multiple badges are shown one after another.
 *
 * No confetti library — a handful of CSS-animated pieces keeps the bundle flat,
 * and the whole thing is skipped under prefers-reduced-motion.
 */
export default function BadgeCelebration({
  badges,
  onSeen,
  labels,
}: {
  badges: Badge[];
  onSeen: () => Promise<void>;
  labels: { title: string; dismiss: string };
}) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(badges.length > 0);
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!open) void onSeen();
  }, [open, onSeen]);

  if (!open || badges.length === 0) return null;
  const badge = badges[index];
  const last = index >= badges.length - 1;

  const next = () => (last ? setOpen(false) : setIndex((i) => i + 1));

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/70 px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={next}
    >
      {!reduced && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className="badge-confetti"
              style={{
                left: `${(i * 7 + 5) % 95}%`,
                animationDelay: `${(i % 5) * 0.12}s`,
                background: ["#c5c3ae", "#8f8d74", "#f5f4f1", "#171310"][i % 4],
              }}
            />
          ))}
        </div>
      )}

      <div className="relative w-full max-w-[300px] rounded-xl2 bg-card p-6 text-center shadow-card">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-smoke">
          {labels.title}
        </p>

        <div className={`mx-auto mt-4 grid h-24 w-24 place-items-center rounded-full bg-sage-soft ${reduced ? "" : "badge-pop"}`}>
          {badge.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={badge.imageUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <span className="text-[44px] leading-none">{badge.emoji}</span>
          )}
        </div>

        <h2 className="mt-4 font-display text-[22px] leading-tight">{badge.name}</h2>
        <p className="mt-1 text-[13px] text-smoke">{badge.description}</p>

        <button
          onClick={next}
          className="mt-5 w-full rounded-xl2 bg-ink py-3 text-[14px] font-semibold text-white transition active:scale-95"
        >
          {last ? labels.dismiss : `${index + 1} / ${badges.length}`}
        </button>
      </div>
    </div>
  );
}
