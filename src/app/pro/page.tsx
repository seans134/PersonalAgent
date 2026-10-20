import { redirect } from "next/navigation";
import { isProPlan, paywallTrigger } from "@personal-agent/core";
import { createClient } from "@/lib/supabase/server";
import { loadSubscriptionStatus } from "@/lib/subscription/usage";
import { ProPanel } from "./pro-panel";

export default async function ProPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; checkout?: string; plan?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const status = await loadSubscriptionStatus(supabase, user.id);
  const checkout = params.checkout === "success" || params.checkout === "canceled" ? params.checkout : null;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-teal">Atlas</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Atlas Pro</h1>
      </div>
      <ProPanel
        checkout={checkout}
        purchasedPlan={checkout === "success" && isProPlan(params.plan) ? params.plan : null}
        status={status}
        trigger={paywallTrigger(params.from)}
      />
    </main>
  );
}
