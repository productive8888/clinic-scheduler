"use client";

import { useActionState } from "react";
import { requestMagicLinkAction, type LoginFormState } from "@/app/login/actions";

const initialState: LoginFormState = {};

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction, pending] = useActionState(
    requestMagicLinkAction,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Email address
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-11 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          placeholder="you@clinic.com"
        />
      </label>

      {state.error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {state.error}
        </p>
      ) : null}

      {state.message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {pending ? "Sending link..." : "Send magic link"}
      </button>
    </form>
  );
}
