"use client";

import { useRef, useState } from "react";
import { Promotion } from "@/lib/types";

export default function PromoCarousel({ promos }: { promos: Promotion[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    if (!card) return;
    const step = card.offsetWidth + 12;
    setIndex(Math.round(el.scrollLeft / step));
  };

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    if (!card) return;
    el.scrollTo({ left: i * (card.offsetWidth + 12), behavior: "smooth" });
  };

  return (
    <div>
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {promos.map((p) => {
          const inner = (
            <>
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" className="h-[168px] w-full object-cover" />
              ) : (
                <div className="h-[168px] w-full bg-gradient-to-br from-sage to-tan" />
              )}
              <div className="p-4">
                {p.badge && (
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-tan-deep">{p.badge}</span>
                )}
                <p className="mt-1 font-display text-[20px] uppercase leading-tight">{p.title}</p>
                {p.subtitle && <p className="mt-0.5 text-[13px] text-smoke">{p.subtitle}</p>}
                {p.body && <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-smoke">{p.body}</p>}
                {p.linkUrl && (
                  <span className="mt-3 inline-block text-[13px] font-semibold text-tan-deep">
                    {p.linkLabel ?? "Find out more"} →
                  </span>
                )}
              </div>
            </>
          );

          const cls =
            "block w-[86%] shrink-0 snap-start overflow-hidden rounded-xl2 bg-card shadow-card transition active:scale-[0.99] sm:w-[70%]";

          return p.linkUrl ? (
            <a key={p.id} href={p.linkUrl} target="_blank" rel="noreferrer" className={cls}>
              {inner}
            </a>
          ) : (
            <div key={p.id} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>

      {promos.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {promos.map((p, i) => (
            <button
              key={p.id}
              onClick={() => goTo(i)}
              aria-label={`Go to ${p.title}`}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-ink" : "w-1.5 bg-line"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
