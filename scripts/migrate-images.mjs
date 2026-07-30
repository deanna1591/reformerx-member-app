/**
 * Move inline base64 images out of app_state into Supabase Storage.
 *
 *   node scripts/migrate-images.mjs --dry
 *   node scripts/migrate-images.mjs
 *
 * instructors is 1.15 MB across 13 rows and promotions 122 KB across 2 — all of
 * it base64 photos on the row. ensureDB() loads every collection on every page
 * render, so those bytes ship on requests that never display them.
 *
 * Creates the bucket if needed, uploads each image, and replaces the field with
 * a public URL. Backs up first and verifies by read-back.
 */
import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry");
const BUCKET = process.env.SUPABASE_MEDIA_BUCKET || "rx-media";

const env = {};
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const SUPA = (env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPA || !KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" };

/* ---------- bucket ---------- */
async function ensureBucket() {
  const list = await fetch(`${SUPA}/storage/v1/bucket`, { headers: H });
  const buckets = list.ok ? await list.json() : [];
  if (Array.isArray(buckets) && buckets.some((b) => b.name === BUCKET)) {
    console.log(`Bucket "${BUCKET}" exists`);
    return true;
  }
  if (DRY) {
    console.log(`Bucket "${BUCKET}" would be created`);
    return true;
  }
  const res = await fetch(`${SUPA}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    // public: images are on a members' screen, not secrets, and public URLs are
    // cacheable by the CDN
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 5242880 }),
  });
  if (!res.ok) {
    console.error("bucket create failed:", res.status, (await res.text()).slice(0, 200));
    return false;
  }
  console.log(`Created public bucket "${BUCKET}"`);
  return true;
}

async function upload(dataUrl, folder) {
  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!m) return null;
  const [, type, b64] = m;
  const bytes = Buffer.from(b64, "base64");
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${EXT[type] ?? "bin"}`;
  const objectPath = `${folder}/${name}`;
  if (DRY) return { url: `${SUPA}/storage/v1/object/public/${BUCKET}/${objectPath}`, bytes: bytes.length };
  const res = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: "POST",
    headers: { ...H, "Content-Type": type, "cache-control": "public, max-age=31536000, immutable", "x-upsert": "true" },
    body: bytes,
  });
  if (!res.ok) {
    console.error(`  upload failed (${res.status}):`, (await res.text()).slice(0, 160));
    return null;
  }
  return { url: `${SUPA}/storage/v1/object/public/${BUCKET}/${objectPath}`, bytes: bytes.length };
}

async function read(name) {
  const r = await fetch(`${SUPA}/rest/v1/app_state?key=eq.db:${name}&select=value`, { headers: H });
  const rows = await r.json();
  return rows.length && rows[0].value != null ? rows[0].value : [];
}

async function write(name, value) {
  const res = await fetch(`${SUPA}/rest/v1/app_state?on_conflict=key`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ key: `db:${name}`, value, updated_at: new Date().toISOString() }]),
  });
  if (!res.ok) throw new Error(`write db:${name}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

if (!(await ensureBucket())) process.exit(1);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.mkdirSync("backups", { recursive: true });

/* collection -> [field, folder] */
const TARGETS = [
  ["instructors", "photoUrl", "instructors"],
  ["promotions", "imageUrl", "promotions"],
  ["badgeDefs", "imageUrl", "badges"],
];

let savedTotal = 0;
for (const [coll, field, folder] of TARGETS) {
  const rows = await read(coll);
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log(`\n${coll}: nothing stored`);
    continue;
  }
  fs.writeFileSync(`backups/${coll}-${stamp}.json`, JSON.stringify(rows, null, 2));

  const inline = rows.filter((r) => typeof r[field] === "string" && r[field].startsWith("data:"));
  console.log(`\n${coll}: ${rows.length} rows, ${inline.length} with inline images`);
  if (inline.length === 0) continue;

  let moved = 0;
  let saved = 0;
  for (const r of inline) {
    const before = r[field].length;
    const up = await upload(r[field], folder);
    if (!up) {
      console.log(`  ${String(r.name ?? r.id).slice(0, 24)} — SKIPPED, image left in place`);
      continue;
    }
    if (!DRY) r[field] = up.url;
    moved++;
    saved += before - up.url.length;
    console.log(`  ${String(r.name ?? r.id).slice(0, 24).padEnd(26)} ${(before / 1024).toFixed(0).padStart(5)} KB -> ${up.url.split("/").pop()}`);
  }
  savedTotal += saved;
  if (!DRY && moved > 0) {
    await write(coll, rows);
    const after = await read(coll);
    const left = after.filter((r) => typeof r[field] === "string" && r[field].startsWith("data:")).length;
    console.log(`  wrote db:${coll} — ${moved} moved, ${left} inline remaining`);
  }
}

console.log(`\n${DRY ? "Would free" : "Freed"} ${(savedTotal / 1048576).toFixed(2)} MB from the database`);
if (DRY) console.log("--dry given, nothing uploaded or written.");
