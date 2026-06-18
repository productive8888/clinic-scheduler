import { EmployeeDirectory } from "@/components/admin/employee-directory";
import { EmployeeForm } from "@/components/admin/employee-form";
import { SetupRequired } from "@/components/layout/setup-required";
import { getEmployeeAdminData } from "@/lib/db/employees";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  let data: Awaited<ReturnType<typeof getEmployeeAdminData>>;

  try {
    data = await getEmployeeAdminData();
  } catch (error) {
    return (
      <SetupRequired
        title="Connect PostgreSQL before managing employees"
        message="Set DATABASE_URL, run the Prisma migration and seed, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  const [employees, skills, workPatterns] = data;

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
          Employee management
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          Staff profiles and skills
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Add employees, review Auth.js account links, maintain skill checklists,
          OPTO balances, and staffing limits used by the scheduler.
        </p>
      </section>

      {typeof params.employeeAction === "string" ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="font-semibold">
                Employee {params.employeeAction}; future schedules invalidated
              </h2>
              <p className="mt-1">
                {params.affectedCount ?? "0"} schedule dates now need regeneration
                {typeof params.affectedDates === "string" && params.affectedDates
                  ? `: ${params.affectedDates}`
                  : "."}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Create employee</h2>
        <div className="mt-4">
          <EmployeeForm skills={skills} workPatterns={workPatterns} />
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold text-slate-950">Directory</h2>
        <EmployeeDirectory
          employees={employees}
          skills={skills}
          workPatterns={workPatterns}
        />
      </section>
    </div>
  );
}
