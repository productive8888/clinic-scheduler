import { redirect } from "next/navigation";
import { EmployeePortalDashboard } from "@/components/employee/employee-portal-dashboard";
import { SetupRequired } from "@/components/layout/setup-required";
import { getCurrentActor } from "@/lib/auth";
import { getEmployeePortalData } from "@/lib/db/employee-portal";

export const dynamic = "force-dynamic";

export default async function EmployeePage({
  searchParams,
}: {
  searchParams: Promise<{ unauthorized?: string | string[] }>;
}) {
  const params = await searchParams;
  const actor = await getCurrentActor();
  let data: Awaited<ReturnType<typeof getEmployeePortalData>>;

  if (!actor) {
    redirect("/login");
  }

  try {
    data = await getEmployeePortalData(actor.id);
  } catch (error) {
    return (
      <SetupRequired
        title="Connect PostgreSQL before viewing the employee portal"
        message="Set DATABASE_URL, run the Prisma migration and seed, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  return (
    <div className="grid gap-4">
      {params.unauthorized === "admin" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your account does not have manager access. You are viewing the
          employee portal instead.
        </div>
      ) : null}
      <EmployeePortalDashboard data={data} />
    </div>
  );
}
