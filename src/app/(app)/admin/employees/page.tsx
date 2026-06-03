import { EmployeeDirectory } from "@/components/admin/employee-directory";
import { EmployeeForm } from "@/components/admin/employee-form";
import { SetupRequired } from "@/components/layout/setup-required";
import { getEmployeeAdminData } from "@/lib/db/employees";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
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
          and set staffing limits used by the scheduler.
        </p>
      </section>

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
