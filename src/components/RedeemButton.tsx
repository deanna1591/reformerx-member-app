"use client";

import { useState, useTransition } from "react";
import { redeemReward } from "@/app/actions";

export default function RedeemButton({ rewardId, cost, canAfford }: { rewardId: string; cost: number; canAfford: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="text-right">
      <button
        disabled={pending || !canAfford}
        onClick={() =>
          start(async () => {
            const res = await redeemReward(rewardId);
            setMsg(res?.message ?? null);
          })
        }
        className="rounded-xl bg-ink px-4 py-2 text-[13px] font-semibold text-white disabled:bg-line disabled:text-smoke"
      >
        {pending ? "…" : `${cost} pts`}
      </button>
      {msg && <p className="mt-1 max-w-[180px] text-[11px] text-smoke">{msg}</p>}
    </div>
  );
}
