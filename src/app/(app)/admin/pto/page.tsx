import { CalendarCheck2 } from "lucide-react";
import { PTORequestForm } from "@/components/pto/pto-request-form";
import { PTORequestList } from "@/components/pto/pto-request-list";
import { SetupRequired } from "@/components/layout/setup-required";
import { getPtoAdminPageData } from "@/lib/db/pto";
import { createPtoForEmployeeAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPtoPage() {
  let data: Awaited<ReturnType<typeof getPtoAdminPageData>>;

  try {
    data = await getPtoAdminPageData();
  } catch (error) {
    return (
      <SetupRequired
        title="Connect PostgreSQL before managing PTO"
        message="Set DATABASE_URL, run the Prisma migration and seed, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  const [requests, employees] = data;
  const pendingCount = requests.filter((request) => request.status === "PENDING").length;

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
          denied when it would put the employee below -24 PTO hours.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          <CalendarCheck2 size={16} aria-hidden="true" />
          {pendingCount} pending
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Create request</h2>
        <div className="mt-4">
          <PTORequestForm
            action={createPtoForEmployeeAction}
            employees={employees}
            submitLabel="Create request"
          />
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold text-slate-950">Request queue</h2>
        <PTORequestList requests={requests} mode="manager" />
      </section>
    </div>
  );
}
