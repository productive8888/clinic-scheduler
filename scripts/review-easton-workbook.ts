import { parseEastonWorkbook } from "../src/lib/easton-import/parser";

async function main() {
  const workbookPath = process.argv[2] ?? null;
  const preview = await parseEastonWorkbook(workbookPath);

  console.log(
    JSON.stringify(
      {
        workbookPath: preview.workbookPath,
        workbookModifiedAt: preview.workbookModifiedAt,
        sheets: preview.sheets,
        shiftCount: preview.shifts.length,
        roleDemandCount: preview.roleDemand.length,
        employeeTargetCount: preview.employeeTargets.length,
        sampleAssignmentCount: preview.sampleAssignments.length,
        warnings: preview.warnings,
        shifts: preview.shifts,
        roleCodes: [...new Set(preview.roleDemand.map((item) => item.roleCode))].sort(),
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
