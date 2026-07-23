/* Show every capacity-related field SimplyBook exposes per service.
   Read-only. Run: node scripts/check-capacity.mjs */
import { readFileSync } from "fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].split("#")[0].trim().replace(/^["']|["']$/g, "");
}
const V2 = "https://user-api-v2.simplybook.it";

const auth = await fetch(`${V2}/admin/auth`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ company: env.SIMPLYBOOK_COMPANY, login: env.SIMPLYBOOK_LOGIN, password: env.SIMPLYBOOK_USER_KEY }),
}).then((r) => r.json());
if (!auth.token) { console.log("AUTH FAILED", auth); process.exit(1); }
const H = { "Content-Type": "application/json", "X-Company-Login": env.SIMPLYBOOK_COMPANY, "X-Token": auth.token };

const provBody = await fetch(`${V2}/admin/providers?on_page=100`, { headers: H }).then((r) => r.json());
const provs = (Array.isArray(provBody) ? provBody : provBody?.data ?? []);
console.log("PROVIDERS — qty = how many clients at once (class capacity)\n");
console.log("coach".padEnd(28), "qty");
console.log("-".repeat(40));
for (const p of provs) console.log(String(p.name ?? "?").slice(0, 26).padEnd(28), p.qty ?? "—");
console.log();

const body = await fetch(`${V2}/admin/services?on_page=100`, { headers: H }).then((r) => r.json());
const services = (Array.isArray(body) ? body : body?.data ?? []).filter((s) => s.is_active !== false);

console.log(`${services.length} active services\n`);
console.log("service".padEnd(32), "limit_booking  min_group  duration");
console.log("-".repeat(72));
for (const s of services) {
  console.log(
    String(s.name ?? "?").slice(0, 30).padEnd(32),
    String(s.limit_booking ?? "—").padEnd(14),
    String(s.min_group_booking ?? "—").padEnd(10),
    String(s.duration ?? "—")
  );
}

// Any other numeric field that might carry capacity
const sample = services[0];
if (sample) {
  const extra = Object.entries(sample).filter(
    ([k, v]) => typeof v === "number" && !["id", "price", "duration", "tax_id", "buffer_time_after", "deposit_price"].includes(k)
  );
  console.log("\nother numeric fields on the first service (in case capacity lives elsewhere):");
  for (const [k, v] of extra) console.log(`  ${k}: ${v}`);
  console.log("\nall field names:", Object.keys(sample).join(", "));
}
console.log("\nSet the limit on ONE class in SimplyBook, re-run this, and see which number changed.");
