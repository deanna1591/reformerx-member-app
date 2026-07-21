"use client";

import { useFormStatus } from "react-dom";

export default function SyncButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className={`rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition ${
        pending ? "cursor-wait bg-smoke" : "bg-ink"
      }`}
    >
      {pending ? "Syncing… this can take a minute" : "↻ Sync from SimplyBook"}
    </button>
  );
}
