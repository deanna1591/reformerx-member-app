/**
 * Put the email header logo in Supabase Storage at a fixed, permanent path.
 *
 *   node scripts/upload-email-logo.mjs --dry
 *   node scripts/upload-email-logo.mjs --prod
 *
 * Deliberately not the LinkedIn CDN URL: that link carries an expiry token
 * (e=1787184000, 20 August 2026), so every email sent after that date would
 * show a broken image. Hosting it ourselves means it never expires.
 *
 * The path is fixed — brand/email-logo.png — so the email template can build
 * the URL from SUPABASE_URL without any extra configuration. Uploading again
 * replaces it in place.
 */
import fs from "node:fs";
import path from "node:path";
import { target } from "./_target.mjs";

const DRY = process.argv.includes("--dry");
const T = target({ write: !DRY });
const BUCKET = process.env.SUPABASE_MEDIA_BUCKET || "rx-media";
const OBJECT = "brand/email-logo.png";
const SOURCE = path.join(process.cwd(), "brand-src", "email-logo.png");

if (!fs.existsSync(SOURCE)) {
  console.error(`Missing ${SOURCE}`);
  process.exit(1);
}
const bytes = fs.readFileSync(SOURCE);
const url = `${T.url}/storage/v1/object/public/${BUCKET}/${OBJECT}`;
console.log(`  ${SOURCE} — ${(bytes.length / 1024).toFixed(1)} KB`);
console.log(`  -> ${url}`);

if (DRY) {
  console.log("\n--dry given, nothing uploaded.");
  process.exit(0);
}

const res = await fetch(`${T.url}/storage/v1/object/${BUCKET}/${OBJECT}`, {
  method: "POST",
  headers: {
    apikey: T.key,
    Authorization: `Bearer ${T.key}`,
    "Content-Type": "image/png",
    // Long cache: the path is stable, and a logo changes about once a decade.
    "cache-control": "public, max-age=31536000",
    "x-upsert": "true",
  },
  body: bytes,
});
if (!res.ok) {
  console.error("upload failed:", res.status, (await res.text()).slice(0, 300));
  process.exit(1);
}

// Fetch it back — a public URL that 404s would silently break every email.
const check = await fetch(url);
console.log(`\nUploaded. Public URL returns ${check.status} ${check.headers.get("content-type")}`);
console.log(check.ok ? "Logo is live." : "PUBLIC FETCH FAILED — check the bucket is public.");
