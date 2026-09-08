"use client";

import { FormEvent, useActionState, useState } from "react";
import { updatePassword } from "@/app/auth/actions";

type ActionState = { error?: string } | undefined;

export function UpdatePasswordForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updatePassword, undefined);
  const [clientError, setClientError] = useState<string>();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password !== confirmPassword) {
      event.preventDefault();
      setClientError("Passwords must match.");
    }
  }

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-[16px] border border-line bg-surface p-6 shadow-[var(--shadow-sm)]"
      onSubmit={handleSubmit}
    >
      <h2 className="text-lg font-semibold text-ink">Set a new password</h2>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-ink-muted" htmlFor="new-password">
          New password
        </label>
        <input
          autoComplete="new-password"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
          id="new-password"
          minLength={8}
          name="password"
          onChange={() => setClientError(undefined)}
          required
          type="password"
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-ink-muted" htmlFor="confirm-password">
          Confirm new password
        </label>
        <input
          autoComplete="new-password"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
          id="confirm-password"
          minLength={8}
          name="confirmPassword"
          onChange={() => setClientError(undefined)}
          required
          type="password"
        />
      </div>
      {clientError || state?.error ? (
        <p className="text-sm text-danger">{clientError ?? state?.error}</p>
      ) : null}
      <button
        className="w-full rounded-lg bg-teal px-4 py-2 text-sm font-medium text-on-teal disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Working..." : "Update password"}
      </button>
    </form>
  );
}
