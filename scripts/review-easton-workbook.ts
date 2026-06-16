import { parseEastonWorkbook } from "../src/lib/easton-import/parser";

async function main() {
  const workbookPath = process.argv[2] ?? null;
  const preview = await parseEastonWorkbook(workbookPath);

  console.log(
    JSON.stringify(
      {
        workbookPath: preview.workbookPath,
        workbookModifiedAt: preview.workbookModifiedAt,
        activeEmployeeTargetSheetName: preview.activeEmployeeTargetSheetName,
        sheets: preview.sheets,
        shiftCount: preview.shifts.length,
        roleDemandCount: preview.roleDemand.length,
        employeeTargetCount: preview.employeeTargets.length,
        sampleAssignmentCount: preview.sampleAssignments.length,
        warnings: preview.warnings,
        shifts: preview.shifts,
        roleCodes: [...new Set(preview.roleDemand.map((item) => item.roleCode))].sort(),
        targetEligibilityCounts: preview.employeeTargets.reduce<Record<string, number>>(
          (counts, target) => {
            counts[target.scheduleEligibility] =
              (counts[target.scheduleEligibility] ?? 0) + 1;
            return counts;
          },
          {},
        ),
        endoscopyTargets: preview.employeeTargets
          .filter(
            (target) =>
              target.scheduleEligibility === "ACTIVE_SCHEDULED" &&
              Number(target.targetTaskCounts.ENDOSCOPY ?? 0) > 0,
          )
          .map((target) => target.employeeName),
        nonActiveEmployeeTargets: preview.employeeTargets
          .filter((target) => target.scheduleEligibility !== "ACTIVE_SCHEDULED")
          .map((target) => ({
            employeeName: target.employeeName,
            roleLabel: target.roleLabel,
            scheduleEligibility: target.scheduleEligibility,
            scheduleEligibilityReason: target.scheduleEligibilityReason,
          })),
        requiredBackgroundTargets: preview.employeeTargets
          .filter((target) => target.requiredBackgroundAssignments > 0)
          .map((target) => ({
            employeeName: target.employeeName,
            requiredBackgroundAssignments: target.requiredBackgroundAssignments,
            scheduleEligibility: target.scheduleEligibility,
          })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
