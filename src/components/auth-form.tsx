"use client";

import { useActionState } from "react";

type ActionState = { error?: string } | undefined;

type AuthFormProps = {
  title: string;
  actionLabel: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
};

export function AuthForm({ title, actionLabel, action }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      <div className="space-y-2">
        <label className="block text-sm text-zinc-700" htmlFor={`${actionLabel}-email`}>
          Email
        </label>
        <input
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          id={`${actionLabel}-email`}
          name="email"
          type="email"
          required
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm text-zinc-700" htmlFor={`${actionLabel}-password`}>
          Password
        </label>
        <input
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          id={`${actionLabel}-password`}
          name="password"
          type="password"
          minLength={8}
          required
        />
      </div>
      {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
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
