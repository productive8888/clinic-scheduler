ALTER TABLE "Employee"
ADD COLUMN "requiredWeeklyBackgroundShifts" INTEGER NOT NULL DEFAULT 0;

UPDATE "Employee" AS employee
SET "requiredWeeklyBackgroundShifts" = target."requiredBackgroundAssignments"
FROM (
  SELECT DISTINCT ON ("employeeId")
    "employeeId",
    "requiredBackgroundAssignments"
  FROM "EmployeeScheduleTarget"
  WHERE "employeeId" IS NOT NULL
  ORDER BY "employeeId", "updatedAt" DESC, "createdAt" DESC
) AS target
WHERE employee."id" = target."employeeId";
