import { Gauge, History, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { OptoAdjustmentForm } from "@/components/admin/opto-adjustment-form";
import { OptoLedgerTable } from "@/components/admin/opto-ledger-table";
import { SetupRequired } from "@/components/layout/setup-required";
import { getCurrentActor } from "@/lib/auth";
import { getOptoAdminPageData } from "@/lib/db/opto";

export const dynamic = "force-dynamic";

export default async function OptoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getCurrentActor();

  if (!actor) {
    redirect("/login");
  }

  if (actor.role !== "ADMIN") {
    redirect("/admin");
  }

  const params = await searchParams;
  const employeeId = stringParam(params.employeeId);
  const startDate = dateParam(params.startDate);
  const endDate = dateParam(params.endDate);
  let data: Awaited<ReturnType<typeof getOptoAdminPageData>>;

  try {
    data = await getOptoAdminPageData({ employeeId, startDate, endDate });
  } catch (error) {
    return (
      <SetupRequired
        title="Apply the OPTO migration before managing balances"
        message="Run the Prisma migration and regenerate the client, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  const totalBalance = data.employees.reduce(
    (total, employee) => total + Number(employee.optoBalanceHours),
    0,
  );

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
              Admin-only OPTO
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-950">
              Manual OPTO balances
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Record manual credits, debits, and exact-balance corrections.
              OPTO remains separate from PTO, NPTO, comp time, payroll, and scheduling.
            </p>
          </div>
          <div className="grid min-w-52 gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-emerald-700">
              <Gauge size={15} aria-hidden="true" />
              Active balance total
            </span>
            <strong className="font-mono text-2xl text-emerald-950">
              {totalBalance.toFixed(2)}h
            </strong>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Adjust balance</h2>
          <p className="mt-1 text-sm text-slate-500">
            Every change requires a reason and creates an append-only ledger entry.
          </p>
          <div className="mt-5">
            <OptoAdjustmentForm employees={data.employees} />
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
              <ShieldCheck size={19} className="text-emerald-700" aria-hidden="true" />
              Current balances
            </h2>
          </div>
          <div className="max-h-[430px] divide-y divide-slate-100 overflow-y-auto">
            {data.employees.map((employee) => (
              <div
                key={employee.id}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <div>
                  <div className="font-semibold text-slate-950">
                    {employee.fullName}
                  </div>
                  <div className="text-xs text-slate-500">{employee.email}</div>
                </div>
                <div className="font-mono text-lg font-semibold text-slate-950">
                  {Number(employee.optoBalanceHours).toFixed(2)}h
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
              <History size={19} className="text-emerald-700" aria-hidden="true" />
              OPTO ledger
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Showing up to 500 immutable adjustment records.
            </p>
          </div>
          <form
            action="/admin/opto"
            className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_150px_150px_auto]"
          >
            <select
              name="employeeId"
              defaultValue={employeeId ?? ""}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">All employees</option>
              {data.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName}
                </option>
              ))}
            </select>
            <input
              name="startDate"
              type="date"
              defaultValue={startDate ?? ""}
              aria-label="Ledger start date"
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
            />
            <input
              name="endDate"
              type="date"
              defaultValue={endDate ?? ""}
              aria-label="Ledger end date"
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
            />
            <button className="h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              Filter
            </button>
          </form>
        </div>
        <OptoLedgerTable entries={data.ledgerEntries} />
      </section>
    </div>
  );
}

function stringParam(value: string | string[] | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateParam(value: string | string[] | undefined) {
  const parsed = stringParam(value);
  return parsed && /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : null;
}
