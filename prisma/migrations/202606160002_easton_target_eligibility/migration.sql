ALTER TABLE "Employee"
ADD COLUMN "scheduleEligible" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "EmployeeScheduleTarget"
ADD COLUMN "activeTargetSheetName" TEXT,
ADD COLUMN "scheduleEligibility" TEXT NOT NULL DEFAULT 'ACTIVE_SCHEDULED',
ADD COLUMN "scheduleEligibilityReason" TEXT;

CREATE INDEX "Employee_scheduleEligible_idx" ON "Employee"("scheduleEligible");
CREATE INDEX "EmployeeScheduleTarget_scheduleEligibility_idx" ON "EmployeeScheduleTarget"("scheduleEligibility");
