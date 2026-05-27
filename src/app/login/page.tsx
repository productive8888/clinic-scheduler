import Link from "next/link";
import { redirect } from "next/navigation";
import { DevUserSwitcher } from "@/components/auth/dev-user-switcher";
import { LoginForm } from "@/components/auth/login-form";
import {
  authConfigured,
  getCurrentActor,
  getLocalDevSwitchEmployees,
  isManagerRole,
  localDevAuthEnabled,
  sessionSourceLabel,
} from "@/lib/auth";
import { getDeploymentEnvStatus } from "@/lib/deployment/env";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string | string[];
    error?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const actor = await getCurrentActor();

  if (actor && !actor.isLocalDev && !actor.isDevFallback) {
    redirect(isManagerRole(actor.role) ? "/schedule" : "/employee");
  }

  const callbackUrl =
    typeof params.callbackUrl === "string" ? params.callbackUrl : "/";
  const error = typeof params.error === "string" ? params.error : null;
  const envStatus = getDeploymentEnvStatus();
  const devEmployees = localDevAuthEnabled()
    ? await getLocalDevSwitchEmployees()
    : [];

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-6">
      <div className="grid w-full max-w-md gap-5 rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
            Clinic Scheduler
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter your employee email and we will send a secure sign-in link.
            The link opens this app and keeps this browser signed in for up to
            30 days unless you log out.
          </p>
        </div>

        {error ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {formatAuthError(error)}
          </p>
        ) : null}

        {!authConfigured() ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Email login is not ready. Missing:{" "}
            {envStatus.missingLabels
              .filter((label) =>
                ["AUTH_SECRET", "EMAIL_SERVER", "EMAIL_FROM"].includes(label),
              )
              .join(", ") || "email configuration"}
            .
          </p>
        ) : null}

        <LoginForm callbackUrl={callbackUrl} />

        {devEmployees.length ? (
          <div className="grid gap-3 border-t border-slate-200 pt-5">
            <p className="text-sm text-slate-500">
              Development mode is active. You can switch users locally without
              sending email. Current source:{" "}
              {sessionSourceLabel(actor?.sessionSource)}.
            </p>
            <DevUserSwitcher
              employees={devEmployees}
              currentEmployeeId={actor?.isDevFallback ? null : actor?.id}
            />
            <Link
              href={actor && isManagerRole(actor.role) ? "/schedule" : "/employee"}
              className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Continue in development mode
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function formatAuthError(error: string) {
  if (error === "AccessDenied") {
    return "Sign-in could not be completed. Request a new login link or contact a manager.";
  }

  if (error === "Verification") {
    return "That login link is invalid or expired. Request a new link.";
  }

  if (error === "Callback") {
    return "Sign-in could not be completed. Confirm the email belongs to one active employee profile, then request a fresh link.";
  }

  return "Sign-in could not be completed. Request a new login link.";
}
