import { CalendarCheck2 } from "lucide-react";
import { NPTORequestForm } from "@/components/npto/npto-request-form";
import { NPTORequestList } from "@/components/npto/npto-request-list";
import { PTORequestForm } from "@/components/pto/pto-request-form";
import { PTORequestList } from "@/components/pto/pto-request-list";
import { SetupRequired } from "@/components/layout/setup-required";
import { getNptoAdminPageData } from "@/lib/db/npto";
import { getPtoAdminPageData } from "@/lib/db/pto";
import {
  createNptoForEmployeeAction,
  createPtoForEmployeeAction,
  updateNptoCapAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPtoPage() {
  let data: [
    Awaited<ReturnType<typeof getPtoAdminPageData>>,
    Awaited<ReturnType<typeof getNptoAdminPageData>>,
  ];

  try {
    data = await Promise.all([
      getPtoAdminPageData(),
      getNptoAdminPageData(),
    ]);
  } catch (error) {
    return (
      <SetupRequired
        title="Connect PostgreSQL before managing PTO"
        message="Set DATABASE_URL, run the Prisma migration and seed, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  const [[requests, employees], [nptoRequests, timeOffSettings]] = data;
  const pendingCount =
    requests.filter((request) => request.status === "PENDING").length +
    nptoRequests.filter((request) => request.status === "PENDING").length;

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
          PTO review
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          Time off and unavailability
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Personal and vacation requests require approval and deduct PTO balance.
          Sick and emergency requests auto-approve. Personal or vacation approval is
          denied when it would put the employee below -24 PTO hours. Approved PTO can
          be reversed without rolling back historical records. NPTO is unpaid,
          separate from PTO balance, and capped by configurable hours.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          <CalendarCheck2 size={16} aria-hidden="true" />
          {pendingCount} pending PTO/NPTO
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">NPTO cap</h2>
        <form action={updateNptoCapAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Cap hours
            <input
              name="nptoCapHours"
              type="number"
              min="0"
              step="0.25"
              defaultValue={timeOffSettings.nptoCapHours.toString()}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
            />
          </label>
          <button className="inline-flex h-10 w-fit items-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            Save cap
          </button>
        </form>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Create request</h2>
        <div className="mt-4 grid gap-6 xl:grid-cols-2">
          <div className="rounded-md border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-950">PTO</h3>
            <div className="mt-4">
              <PTORequestForm
                action={createPtoForEmployeeAction}
                employees={employees}
                submitLabel="Create PTO request"
              />
            </div>
          </div>
          <div className="rounded-md border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-950">NPTO</h3>
            <div className="mt-4">
              <NPTORequestForm
                action={createNptoForEmployeeAction}
                employees={employees}
                submitLabel="Create NPTO request"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold text-slate-950">PTO request queue</h2>
        <PTORequestList requests={requests} mode="manager" />
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold text-slate-950">NPTO request queue</h2>
        <NPTORequestList requests={nptoRequests} mode="manager" />
      </section>
    </div>
  );
}
