import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  await supabase.from("google_calendar_tokens").delete().eq("user_id", user.id);
  return NextResponse.redirect(new URL("/calendar?disconnected=1", request.url));
}
