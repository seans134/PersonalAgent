import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { createBearerClient, getBearerToken } from "./bearer";
import { createClient } from "./server";

type AuthenticatedRequestClient = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
  authMethod: "bearer" | "cookie";
};

export async function getAuthenticatedRequestClient(
  request?: NextRequest | Request,
): Promise<AuthenticatedRequestClient | null> {
  const accessToken = request ? getBearerToken(request) : undefined;

  if (accessToken) {
    const supabase = createBearerClient(accessToken);
    const {
      data: { user },
    } = await supabase.auth.getUser(accessToken);

    if (!user) {
      return null;
    }

    return {
      supabase: supabase as never,
      user,
      authMethod: "bearer",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return {
    supabase,
    user,
    authMethod: "cookie",
  };
}
