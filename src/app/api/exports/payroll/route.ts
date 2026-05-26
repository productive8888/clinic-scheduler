import { writeAuditLog } from "@/lib/audit";
import { auditActorId, getCurrentActor, isManagerRole } from "@/lib/auth";
import { getPayrollReport } from "@/lib/db/payroll";
import { csvResponse, payrollReportToCsv } from "@/lib/payroll/csv";
import { getPayrollPeriodContaining } from "@/lib/payroll/period";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await getCurrentActor();

  if (!actor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isManagerRole(actor.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const defaultPeriod = getPayrollPeriodContaining(new Date());
  const startDate = dateParam(url.searchParams.get("startDate")) ?? defaultPeriod.startDate;
  const endDate = dateParam(url.searchParams.get("endDate")) ?? defaultPeriod.endDate;
  const report = await getPayrollReport({ startDate, endDate });

  await writeAuditLog({
    actorEmployeeId: auditActorId(actor),
    action: "payroll.export_csv",
    entityType: "PayrollReport",
    entityId: null,
    after: {
      startDate,
      endDate,
      employeeCount: report.rows.length,
      warningCount: report.warnings.length,
    },
  });

  return csvResponse({
    filename: `payroll-${startDate}-to-${endDate}.csv`,
    body: payrollReportToCsv(report),
  });
}

function dateParam(value: string | null) {
  if (!value) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
