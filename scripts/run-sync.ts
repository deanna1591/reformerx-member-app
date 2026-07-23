/* Run the SimplyBook sync from the terminal, bypassing the UI.
   Usage: npx tsx scripts/run-sync.ts
   Prints the result and writes .data/db.json (same store the app reads). */
import { readFileSync } from "fs";

// load .env.local (tsx doesn't do this automatically)
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].split("#")[0].trim().replace(/^["']|["']$/g, "");
  }
} catch {
  console.log("no .env.local found");
}

async function main() {
  const { simplybookConfigured, syncFromSimplybook } = await import("../src/lib/simplybook");
  const { getDB, ensureDB } = await import("../src/lib/store");

  console.log("configured:", simplybookConfigured());
  // Load the shared database first. Without this the sync would work against a
  // local cache only, and the write-guard would (correctly) refuse to save.
  await ensureDB();
  const before = getDB();
  console.log(`loaded store: ${before.members.length} members, ${before.bookings.length} bookings`);
  console.time("sync");
  try {
    const result = await syncFromSimplybook();
  console.timeEnd("sync");
  console.log("\nRESULT:", JSON.stringify(result, null, 2));
  const db = getDB();
  const active = db.members.filter((m) => new Date(m.membershipExpires).getTime() > Date.now());
  console.log(`\nmembers total: ${db.members.length}, active: ${active.length}`);
  console.log("sample active members (name redacted):");
  for (const m of active.slice(0, 8)) {
    console.log(`  ${m.name.slice(0, 2)}*** | ${m.membershipType} | until ${m.membershipExpires.slice(0, 10)}`);
  }
  console.log(`bookings in store: ${db.bookings.length}, classes: ${db.classes.length}`);
  } catch (e) {
    console.timeEnd("sync");
    console.error("\nSYNC THREW:", e);
  }
}
main();
