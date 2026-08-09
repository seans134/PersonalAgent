/**
 * One-time cleanup for the removed Google Calendar integration.
 *
 * Revokes every stored OAuth token at Google so no Atlas grant is left behind in
 * a user's Google account, then reports what it did. Run this BEFORE applying
 * the drop migration supabase/migrations/20260721200138_drop_google_calendar.sql —
 * once the table is dropped the tokens are gone and the grants can no longer be
 * revoked programmatically.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node db/revoke_google_calendar_tokens.mjs
 *
 * Safe to re-run: revoking an already-revoked token is a no-op at Google.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin
  .from("google_calendar_tokens")
  .select("user_id, access_token, refresh_token");

if (error) {
  console.error(`Unable to read google_calendar_tokens: ${error.message}`);
  process.exit(1);
}

const rows = data ?? [];
console.log(`Found ${rows.length} stored token row(s).`);

let revoked = 0;
let failed = 0;
let skipped = 0;

for (const row of rows) {
  // Revoking a refresh token invalidates the whole grant; fall back to the
  // access token when no refresh token was ever issued.
  const token = row.refresh_token ?? row.access_token;

  if (!token) {
    skipped += 1;
    continue;
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(10_000),
    });

    // Google answers 400 for tokens that are already expired or revoked, which
    // is the desired end state, so it counts as success.
    if (response.ok || response.status === 400) {
      revoked += 1;
    } else {
      failed += 1;
      console.warn(`Revoke failed for user ${row.user_id}: HTTP ${response.status}`);
    }
  } catch (revokeError) {
    failed += 1;
    const message = revokeError instanceof Error ? revokeError.message : String(revokeError);
    console.warn(`Revoke failed for user ${row.user_id}: ${message}`);
  }
}

console.log(`Revoked: ${revoked} | Failed: ${failed} | Skipped (no token): ${skipped}`);

if (failed > 0) {
  console.error("Some tokens could not be revoked. Re-run before dropping the table.");
  process.exit(1);
}

console.log(
  "All tokens revoked. Safe to apply the drop migration " +
    "(supabase/migrations/20260721200138_drop_google_calendar.sql).",
);
