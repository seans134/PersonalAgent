import { NextRequest, NextResponse } from "next/server";
import { createBearerClient, getBearerToken } from "@/lib/supabase/bearer";

export async function GET(request: NextRequest) {
  const accessToken = getBearerToken(request);

  if (!accessToken) {
    return NextResponse.json({ ok: false, error: "Bearer token required." }, { status: 401 });
  }

  const supabase = createBearerClient(accessToken);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Invalid session." },
      { status: 401 },
    );
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email ?? null,
    },
  });
}
