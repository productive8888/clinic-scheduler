import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import {
  getSessionDiagnostics,
  isManagerRole,
  sessionSourceLabel,
} from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getDeploymentEnvStatus } from "@/lib/deployment/env";
import {
  repairAllAuthAccountsAction,
  repairAuthAccountAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function DiagnosticsPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const params = await searchParams;
  const lookupEmail =
    typeof params.email === "string" ? normalizeEmail(params.email) : null;
  const [session, envStatus] = await Promise.all([
    getSessionDiagnostics(),
    Promise.resolve(getDeploymentEnvStatus()),
  ]);
  const canView =
    process.env.NODE_ENV === "development" ||
    Boolean(session.actor && isManagerRole(session.actor.role));

  if (!canView) {
    redirect("/admin");
  }

  const emailLookup = lookupEmail ? await getEmailLookup(lookupEmail) : null;

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
          Diagnostics
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          Session and deployment readiness
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Verify which authentication source is active and whether required
          deployment variables are configured. Secret values are intentionally
          hidden.
        </p>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">
          Login email lookup
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Paste an email to verify that this deployed database has an active
          Employee row for it. This does not send a login email and does not
          show tokens.
        </p>
        <form
          action="/admin/diagnostics"
          className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"
        >
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Email
            <input
              name="email"
              type="email"
              defaultValue={lookupEmail ?? ""}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
              placeholder="employee@example.com"
            />
          </label>
          <button className="h-10 self-end rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
            Check email
          </button>
        </form>
        {emailLookup ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-md bg-slate-50 p-3">
              <h3 className="text-sm font-semibold text-slate-950">
                Employee match
              </h3>
              <dl className="mt-3 grid gap-2">
                <DiagnosticRow
                  label="Found"
                  value={emailLookup.employee ? "Yes" : "No"}
                />
                <DiagnosticRow
                  label="Status"
                  value={emailLookup.employee?.status ?? "None"}
                />
                <DiagnosticRow
                  label="Role"
                  value={emailLookup.employee?.role ?? "None"}
                />
                <DiagnosticRow
                  label="Employee ID"
                  value={emailLookup.employee?.id ?? "None"}
                />
                <DiagnosticRow
                  label="Auth link present"
                  value={emailLookup.employee?.authProviderId ? "Yes" : "No"}
                />
              </dl>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <h3 className="text-sm font-semibold text-slate-950">
                Auth.js user match
              </h3>
              <dl className="mt-3 grid gap-2">
                <DiagnosticRow
                  label="Found"
                  value={emailLookup.user ? "Yes" : "No"}
                />
                <DiagnosticRow
                  label="User ID"
                  value={emailLookup.user?.id ?? "None"}
                />
                <DiagnosticRow
                  label="Email"
                  value={emailLookup.user?.email ?? lookupEmail ?? "None"}
                />
                <DiagnosticRow
                  label="Outstanding links"
                  value={String(emailLookup.verificationTokenCount)}
                />
                <DiagnosticRow
                  label="Newest link expires"
                  value={
                    emailLookup.latestVerificationToken?.expires.toISOString() ??
                    "None"
                  }
                />
              </dl>
            </div>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {lookupEmail ? (
            <form action={repairAuthAccountAction}>
              <input type="hidden" name="email" value={lookupEmail} />
              <button className="h-10 rounded-md border border-emerald-700 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">
                Repair this login
              </button>
            </form>
          ) : null}
          <form action={repairAllAuthAccountsAction}>
            <button className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              Repair all active logins
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-emerald-700" size={20} aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-950">
              Current session
            </h2>
          </div>
          <dl className="mt-4 grid gap-3 text-sm">
            <DiagnosticRow
              label="Session source"
              value={sessionSourceLabel(session.source)}
            />
            <DiagnosticRow
              label="Employee"
              value={session.actor?.fullName ?? "Not resolved"}
            />
            <DiagnosticRow
              label="Employee ID"
              value={session.actor?.id ?? session.authJsEmployeeId ?? "None"}
            />
            <DiagnosticRow
              label="Email"
              value={session.actor?.email ?? session.authJsEmail ?? "None"}
            />
            <DiagnosticRow label="Role" value={session.actor?.role ?? "None"} />
            <DiagnosticRow
              label="Auth.js session present"
              value={session.authJsSessionPresent ? "Yes" : "No"}
            />
            <DiagnosticRow
              label="Auth.js employee resolved"
              value={session.authJsEmployeeResolved ? "Yes" : "No"}
            />
            <DiagnosticRow
              label="Local dev auth enabled"
              value={session.localDevAuthEnabled ? "Yes" : "No"}
            />
          </dl>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">
            Deployment variables
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {envStatus.ready
              ? "All required variables are present."
              : `Missing: ${envStatus.missingLabels.join(", ")}`}
          </p>
          <div className="mt-4 grid gap-2">
            {envStatus.items.map((item) => (
              <div
                key={item.key}
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-950">
                    {item.label}
                  </span>
                  <span
                    className={
                      item.configured
                        ? "rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
                        : "rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"
                    }
                  >
                    {item.configured ? "Configured" : "Missing"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

async function getEmailLookup(email: string) {
  const [employee, user, verificationTokenCount, latestVerificationToken] =
    await Promise.all([
      getDb().employee.findFirst({
        where: {
          email: {
            equals: email,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
          authProviderId: true,
        },
      }),
      getDb().user.findFirst({
        where: {
          email: {
            equals: email,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
          email: true,
        },
      }),
      getDb().verificationToken.count({
        where: {
          identifier: email,
        },
      }),
      getDb().verificationToken.findFirst({
        where: {
          identifier: email,
        },
        select: {
          expires: true,
        },
        orderBy: {
          expires: "desc",
        },
      }),
    ]);

  return { employee, user, verificationTokenCount, latestVerificationToken };
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md bg-slate-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-normal text-slate-500">
        {label}
      </dt>
      <dd className="break-words font-mono text-xs text-slate-800">{value}</dd>
    </div>
  );
}
