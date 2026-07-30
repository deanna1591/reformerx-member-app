/**
 * Which database is this script about to touch?
 *
 * Every script in here talks to Supabase over PostgREST, and until now they all
 * read .env.local — which points at production. Yesterday's data loss was a
 * button, but the likelier next one is a script run against live members while
 * meaning to test.
 *
 * Resolution order:
 *   1. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment (CI)
 *   2. .env.development.local   <- your dev project, used by `npm run dev` too
 *   3. .env.local               <- production
 *
 * A script that writes refuses to touch production unless given --prod. Reads
 * are never gated; they just say where they're pointed.
 */

import fs from "node:fs";
import path from "node:path";

function parse(file) {
  if (!fs.existsSync(file)) return null;
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

const DEV_FILE = ".env.development.local";
const PROD_FILE = ".env.local";

/**
 * @param {{ write?: boolean }} opts  write:true gates production behind --prod
 */
export function target({ write = false } = {}) {
  const argv = process.argv.slice(2);
  const wantProd = argv.includes("--prod");

  const dev = parse(path.join(process.cwd(), DEV_FILE));
  const prod = parse(path.join(process.cwd(), PROD_FILE));

  // The production host is whatever .env.local says, so this keeps working if
  // you ever move projects.
  const prodHost = prod?.SUPABASE_URL ? new URL(prod.SUPABASE_URL).host : null;

  let url = process.env.SUPABASE_URL ?? "";
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  let source = "environment";

  if (!url || !key) {
    // --prod means production explicitly; otherwise prefer dev when it exists.
    const pick = wantProd ? prod : dev ?? prod;
    const pickName = wantProd ? PROD_FILE : dev ? DEV_FILE : PROD_FILE;
    url = pick?.SUPABASE_URL ?? "";
    key = pick?.SUPABASE_SERVICE_ROLE_KEY ?? "";
    source = pickName;
  }

  url = url.replace(/\/$/, "");
  if (!url || !key) {
    console.error(`Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (checked env, ${DEV_FILE}, ${PROD_FILE})`);
    process.exit(1);
  }

  const host = new URL(url).host;
  const isProd = prodHost !== null && host === prodHost;

  const tag = isProd ? "PRODUCTION" : "dev";
  console.log(`Target: ${tag}  ${host}  (from ${source})`);

  if (write && isProd && !wantProd) {
    console.error("");
    console.error("  Refusing to write to PRODUCTION without --prod.");
    console.error("");
    console.error(`  Add --prod if that is really what you want, or create ${DEV_FILE}`);
    console.error("  with your development project's credentials to work safely.");
    console.error("");
    process.exit(1);
  }
  if (write && isProd && wantProd) {
    console.log("  --prod given: writing to LIVE member data.\n");
  }

  return {
    url,
    key,
    host,
    isProd,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  };
}
