ALTER TABLE "WorkPattern"
ADD COLUMN "requiredSaturdayShiftCategory" "ShiftCategory",
ADD COLUMN "extraHourWeekdays" JSONB;

ALTER TABLE "EmployeeScheduleTarget"
ADD COLUMN "workPatternCode" TEXT,
ADD COLUMN "requiredBackgroundAssignments" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "extraHourWeekdays" JSONB;

CREATE INDEX "EmployeeScheduleTarget_workPatternCode_idx" ON "EmployeeScheduleTarget"("workPatternCode");
