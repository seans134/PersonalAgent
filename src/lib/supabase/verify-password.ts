import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
export async function verifyAccountPassword(user: User, password: unknown) {
  if (typeof password !== "string" || !password || !user.email) throw new Error("Enter your current password.");
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password });
  if (error || data.user?.id !== user.id) throw new Error("Current password is incorrect.");
  return client;
}
