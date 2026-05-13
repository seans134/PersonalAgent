"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createGoal(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();

  if (!title) {
    redirect("/goals?error=Goal%20title%20is%20required");
  }

  const { error } = await supabase.from("goals").insert({
    user_id: user.id,
    title,
    description: description || null,
    end_date: endDate || null,
  });

  if (error) {
    redirect(`/goals?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/goals");
  redirect("/goals");
}

export async function updateGoal(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();

  if (!id) {
    redirect("/goals?error=Goal%20id%20is%20required");
  }

  if (!title) {
    redirect("/goals?error=Goal%20title%20is%20required");
  }

  const { error } = await supabase
    .from("goals")
    .update({
      title,
      description: description || null,
      end_date: endDate || null,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    redirect(`/goals?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/goals");
  revalidatePath(`/goals/${id}`);
  redirect("/goals");
}

export async function removeGoal(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const id = String(formData.get("id") ?? "").trim();

  if (!id) {
    redirect("/goals?error=Goal%20id%20is%20required");
  }

  const { error } = await supabase.from("goals").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    redirect(`/goals?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/goals");
  redirect("/goals");
}

export async function completeGoal(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const id = String(formData.get("id") ?? "").trim();

  if (!id) {
    redirect("/goals?error=Goal%20id%20is%20required");
  }

  const { error } = await supabase
    .from("goals")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    redirect(`/goals?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/goals");
  revalidatePath(`/goals/${id}`);
  redirect("/goals");
}
