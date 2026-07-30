/**
 * Image uploads to Supabase Storage.
 *
 * Images used to be stored as base64 data URLs on the row itself. That made the
 * instructors collection 1.15 MB for 13 rows — and because ensureDB() loads
 * every collection on every render, the whole studio's headshots came down the
 * wire to draw the schedule. Storage keeps them out of the database entirely and
 * serves them from a CDN with proper caching.
 *
 * Falls back to a data URL when Storage isn't configured, so a missing bucket
 * degrades to the old behaviour rather than losing someone's photo.
 */

const BUCKET = process.env.SUPABASE_MEDIA_BUCKET || "rx-media";

function creds() {
  const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  return url && key ? { url, key } : null;
}

export function storageConfigured(): boolean {
  return creds() !== null;
}

/** Public URL for an object already in the bucket. */
export function publicUrl(objectPath: string): string {
  const c = creds();
  return c ? `${c.url}/storage/v1/object/public/${BUCKET}/${objectPath}` : objectPath;
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/**
 * Upload bytes and return a public URL.
 *
 * `folder` groups objects (instructors, promotions, badges). The filename gets a
 * random suffix so replacing an image busts any CDN cache — overwriting the same
 * path would leave the old picture visible for hours.
 */
export async function uploadImage(
  bytes: ArrayBuffer | Uint8Array,
  contentType: string,
  folder: string
): Promise<string | null> {
  const c = creds();
  // Newer @types/node make Uint8Array generic (Uint8Array<ArrayBufferLike>),
  // and neither BodyInit nor BlobPart accepts one whose buffer might be a
  // SharedArrayBuffer. Copying into a plainly-backed array satisfies both
  // without a cast, and the copy is trivial at image sizes.
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new Uint8Array(src.byteLength);
  view.set(src);
  const blob = new Blob([view], { type: contentType });

  if (!c) {
    // No Storage — keep the old inline behaviour so nothing breaks.
    const b64 = Buffer.from(view).toString("base64");
    return `data:${contentType};base64,${b64}`;
  }

  const ext = EXT[contentType] ?? "bin";
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const objectPath = `${folder}/${name}`;

  try {
    const res = await fetch(`${c.url}/storage/v1/object/${BUCKET}/${objectPath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.key}`,
        "Content-Type": contentType,
        "cache-control": "public, max-age=31536000, immutable",
        "x-upsert": "true",
      },
      body: blob,
    });
    if (!res.ok) {
      console.error("[storage] upload failed:", res.status, (await res.text()).slice(0, 200));
      // Fall back rather than silently dropping the image the user just chose.
      return `data:${contentType};base64,${Buffer.from(view).toString("base64")}`;
    }
    return publicUrl(objectPath);
  } catch (e) {
    console.error("[storage] upload error:", e);
    return `data:${contentType};base64,${Buffer.from(view).toString("base64")}`;
  }
}

/** Upload a browser File from a server action. Returns null when empty. */
export async function uploadFormImage(file: unknown, folder: string): Promise<string | null> {
  if (!file || typeof file !== "object") return null;
  const f = file as File;
  if (typeof f.arrayBuffer !== "function" || !f.size) return null;
  if (!String(f.type).startsWith("image/")) return null;
  return uploadImage(await f.arrayBuffer(), f.type, folder);
}

/** Upload a `data:image/...;base64,...` string. Passes through anything else. */
export async function uploadDataUrl(dataUrl: string, folder: string): Promise<string | null> {
  // [\s\S] rather than the s flag, which needs an ES2018 target
  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!m) return dataUrl || null;
  return uploadImage(Buffer.from(m[2], "base64"), m[1], folder);
}
