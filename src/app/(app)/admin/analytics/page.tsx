import type { ClinicScenario } from "@prisma/client";
import { StaffingAnalyticsDashboard } from "@/components/admin/staffing-analytics-dashboard";
import { SetupRequired } from "@/components/layout/setup-required";
import { getStaffingAnalyticsPageData } from "@/lib/db/analytics";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    startDate?: string | string[];
    endDate?: string | string[];
    employeeId?: string | string[];
    taskTypeId?: string | string[];
    scenario?: string | string[];
  }>;
}) {
  const params = await searchParams;
  let data: Awaited<ReturnType<typeof getStaffingAnalyticsPageData>>;

  try {
    data = await getStaffingAnalyticsPageData({
      startDate: getParam(params.startDate),
      endDate: getParam(params.endDate),
      employeeId: getParam(params.employeeId),
      taskTypeId: getParam(params.taskTypeId),
      scenario: normalizeScenario(getParam(params.scenario)),
    });
  } catch (error) {
    return (
      <SetupRequired
        title="Connect PostgreSQL before viewing analytics"
        message="Set DATABASE_URL, run the Prisma migration and seed, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  return <StaffingAnalyticsDashboard data={data} />;
}

function getParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function normalizeScenario(value: string | undefined): ClinicScenario | "" {
  const scenarios: ClinicScenario[] = [
    "ROUTINE",
    "CLINIC_CLOSED",
    "DOCTOR_OFF_REDUCED_STAFFING",
    "CUSTOM",
  ];

  return scenarios.includes(value as ClinicScenario)
    ? (value as ClinicScenario)
    : "";
}
