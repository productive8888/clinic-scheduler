import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import {
  getSessionDiagnostics,
  sessionSourceLabel,
} from "@/lib/auth";
import { getDeploymentEnvStatus } from "@/lib/deployment/env";

export const dynamic = "force-dynamic";

export default async function DiagnosticsPage() {
  const [session, envStatus] = await Promise.all([
    getSessionDiagnostics(),
    Promise.resolve(getDeploymentEnvStatus()),
  ]);
  const canView =
    process.env.NODE_ENV === "development" || session.actor?.role === "ADMIN";

  if (!canView) {
    redirect("/admin");
  }

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
