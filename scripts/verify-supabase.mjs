// Quick connectivity check for the Supabase env vars.
//   node --env-file=.env scripts/verify-supabase.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

function mask(v) {
  if (!v) return "(missing)";
  return v.length <= 12 ? v : `${v.slice(0, 6)}…${v.slice(-4)} (len ${v.length})`;
}

console.log("URL:    ", url ?? "(missing)");
console.log("ANON:   ", mask(anon));
console.log("SERVICE:", mask(service));
console.log("");

if (!url || !anon || !service) {
  console.error("❌ One or more variables are missing from .env.");
  process.exit(1);
}
if (!/^https:\/\/.+\.supabase\.co\/?$/.test(url)) {
  console.warn("⚠️  URL doesn't look like https://<ref>.supabase.co — double-check it.");
}

let ok = true;

// 1) Anonymous key + URL reachability
try {
  const a = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await a.from("stocks").select("symbol").limit(1);
  if (!error) {
    console.log("✅ ANON key works. `stocks` table already exists and is readable.");
  } else if (error.code === "42P01" || /does not exist/i.test(error.message)) {
    console.log("✅ ANON key works (connected). `stocks` table not created yet — expected before the migration.");
  } else if (/api key|jwt|unauthorized/i.test(error.message)) {
    ok = false;
    console.error(`❌ ANON key rejected: ${error.message}`);
  } else {
    console.log(`✅ ANON key connected. (query note: ${error.message})`);
  }
} catch (e) {
  ok = false;
  console.error(`❌ Could not reach Supabase with ANON key/URL: ${e.message}`);
}

// 2) Service-role key (admin capability)
try {
  const s = createClient(url, service, { auth: { persistSession: false } });
  const { error } = await s.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (!error) {
    console.log("✅ SERVICE_ROLE key works (admin access confirmed).");
  } else {
    ok = false;
    console.error(`❌ SERVICE_ROLE key problem: ${error.message}`);
  }
} catch (e) {
  ok = false;
  console.error(`❌ SERVICE_ROLE key error: ${e.message}`);
}

console.log("");
console.log(ok ? "🎉 All keys look good." : "⚠️  Fix the errors above.");
process.exit(ok ? 0 : 1);
