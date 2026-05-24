import { redirect } from "next/navigation";
import { EmployeePortalDashboard } from "@/components/employee/employee-portal-dashboard";
import { SetupRequired } from "@/components/layout/setup-required";
import { getCurrentActor } from "@/lib/auth";
import { getEmployeePortalData } from "@/lib/db/employee-portal";

export const dynamic = "force-dynamic";

export default async function EmployeePage() {
  const actor = await getCurrentActor();
  let data: Awaited<ReturnType<typeof getEmployeePortalData>>;

  if (!actor) {
    redirect("/sign-in");
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

  return <EmployeePortalDashboard data={data} />;
}
