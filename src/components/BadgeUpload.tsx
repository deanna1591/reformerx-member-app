"use client";

import { useState } from "react";

const MAX_BYTES = 100 * 1024;

/**
 * Reads the chosen image in the browser and submits it as a data URL, so the
 * artwork rides along in the same row as the rest of the badge. No storage
 * bucket to configure, at the cost of a hard size cap.
 */
export default function BadgeUpload({
  action,
  labels,
}: {
  action: (fd: FormData) => Promise<void>;
  labels: { name: string; description: string; classes: string; image: string; save: string };
}) {
  const [preview, setPreview] = useState<string>("");
  const [error, setError] = useState<string>("");

  const pick = (file?: File) => {
    setError("");
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError(`${Math.round(file.size / 1024)} KB — too large, keep it under 100 KB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result ?? ""));
    reader.onerror = () => setError("Could not read that file");
    reader.readAsDataURL(file);
  };

  return (
    <form action={action} className="mt-3 space-y-3">
      <div>
        <label htmlFor="badge-name">{labels.name}</label>
        <input id="badge-name" name="name" required maxLength={40} />
      </div>
      <div>
        <label htmlFor="badge-desc">{labels.description}</label>
        <input id="badge-desc" name="description" required maxLength={120} />
      </div>
      <div>
        <label htmlFor="badge-classes">{labels.classes}</label>
        <input id="badge-classes" name="classesRequired" type="number" min={1} max={2000} required />
      </div>
      <div>
        <label htmlFor="badge-image">{labels.image}</label>
        <input
          id="badge-image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <input type="hidden" name="imageUrl" value={preview} />
      </div>

      {error && <p className="text-[12px] font-medium text-tan-deep">{error}</p>}
      {preview && (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="h-14 w-14 rounded-full object-cover" />
          <button type="button" onClick={() => setPreview("")} className="text-[12px] text-smoke underline">
            remove
          </button>
        </div>
      )}

      <button className="w-full rounded-xl2 bg-ink py-3 text-[14px] font-semibold text-white">
        {labels.save}
      </button>
    </form>
  );
}
