import { ClockArrowUp } from "lucide-react";
import { OvertimeEntryForm } from "@/components/overtime/overtime-entry-form";
import { OvertimeEntryList } from "@/components/overtime/overtime-entry-list";
import { SetupRequired } from "@/components/layout/setup-required";
import { getOvertimeAdminPageData } from "@/lib/db/overtime";
import { createOvertimeEntryForEmployeeAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function OvertimePage() {
  let data: Awaited<ReturnType<typeof getOvertimeAdminPageData>>;

  try {
    data = await getOvertimeAdminPageData();
  } catch (error) {
    return (
      <SetupRequired
        title="Apply the overtime migration before reviewing entries"
        message="Run the Prisma migration and regenerate the client, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  const [entries, employees] = data;
  const pendingCount = entries.filter((entry) => entry.status === "PENDING").length;

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase text-emerald-800">
          Overtime approval
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          Logged overtime
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Approving an entry uses the employee&apos;s OPTO balance first. Only the
          remaining payable overtime hours are added to payroll.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          <ClockArrowUp size={16} aria-hidden="true" />
          {pendingCount} pending
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">
          Log overtime for an employee
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Manager-created entries still remain pending until approved.
        </p>
        <div className="mt-4">
          <OvertimeEntryForm
            action={createOvertimeEntryForEmployeeAction}
            employees={employees}
          />
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold text-slate-950">
          Overtime review queue and history
        </h2>
        <OvertimeEntryList entries={entries} mode="manager" />
      </section>
    </div>
  );
}
