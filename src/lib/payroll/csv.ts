import type { PayrollReportSummary } from "./types";

const headers = [
  "Employee",
  "Email",
  "Expected Hours",
  "Scheduled Work Hours",
  "PTO Hours",
  "NPTO Unpaid Hours",
  "Paid Holiday Hours",
  "Comp Time Credit Hours",
  "Comp Time Debit Hours",
  "Manual Adjustment Hours",
  "Final Paid Hours Estimate",
  "Assignments",
  "Manual Overrides",
  "Warnings",
];

export function payrollReportToCsv(report: PayrollReportSummary) {
  const rows = report.rows.map((row) => [
    row.employeeName,
    row.email,
    formatNumber(row.expectedHours),
    formatNumber(row.scheduledWorkHours),
    formatNumber(row.ptoHours),
    formatNumber(row.nptoUnpaidHours),
    formatNumber(row.paidHolidayHours),
    formatNumber(row.compTimeCreditHours),
    formatNumber(row.compTimeDebitHours),
    formatNumber(row.manualAdjustmentHours),
    formatNumber(row.finalPaidHoursEstimate),
    row.assignmentCount.toString(),
    row.manualOverrideCount.toString(),
    row.warningCodes.join("; "),
  ]);

  return [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");
}

export function csvResponse(input: { filename: string; body: string }) {
  return new Response(input.body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${input.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function escapeCsvCell(value: string) {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

function formatNumber(value: number) {
  return value.toFixed(2);
}
