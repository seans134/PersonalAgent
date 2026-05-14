"use client";

import { FormEvent, useActionState, useState } from "react";

type ActionState = { error?: string } | undefined;

type AuthFormProps = {
  title: string;
  actionLabel: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  requirePasswordConfirmation?: boolean;
};

export function AuthForm({ title, actionLabel, action, requirePasswordConfirmation = false }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [clientError, setClientError] = useState<string>();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!requirePasswordConfirmation) {
      return;
    }

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
      className="space-y-3 rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-sm"
      onSubmit={handleSubmit}
    >
      <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
      <div className="space-y-2">
        <label className="block text-sm text-zinc-200" htmlFor={`${actionLabel}-email`}>
          Email
        </label>
        <input
          className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-300"
          id={`${actionLabel}-email`}
          name="email"
          type="email"
          required
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm text-zinc-200" htmlFor={`${actionLabel}-password`}>
          Password
        </label>
        <input
          className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-300"
          id={`${actionLabel}-password`}
          name="password"
          type="password"
          autoComplete={requirePasswordConfirmation ? "new-password" : "current-password"}
          minLength={8}
          onChange={() => setClientError(undefined)}
          required
        />
      </div>
      {requirePasswordConfirmation ? (
        <div className="space-y-2">
          <label className="block text-sm text-zinc-200" htmlFor={`${actionLabel}-confirm-password`}>
            Confirm password
          </label>
          <input
            className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-300"
            id={`${actionLabel}-confirm-password`}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            onChange={() => setClientError(undefined)}
            required
          />
        </div>
      ) : null}
      {clientError || state?.error ? <p className="text-sm text-red-600">{clientError ?? state?.error}</p> : null}
      <button
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Working..." : actionLabel}
      </button>
    </form>
  );
}
