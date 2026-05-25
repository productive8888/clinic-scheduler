ALTER TYPE "RequestStatus" ADD VALUE 'REVERSED';
ALTER TYPE "RequestStatus" ADD VALUE 'OVERRIDDEN';

CREATE TYPE "TaskSlotRequirementLevel" AS ENUM ('REQUIRED', 'DESIRED', 'OPTIONAL', 'CONDITIONAL');

ALTER TABLE "TaskSlot"
  ADD COLUMN "requirementLevel" "TaskSlotRequirementLevel" NOT NULL DEFAULT 'REQUIRED',
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'DEFAULT',
  ADD COLUMN "staffingRequirementRuleId" TEXT;

CREATE TABLE "StaffingRequirementRule" (
  "id" TEXT NOT NULL,
  "taskTypeId" TEXT NOT NULL,
  "weekday" INTEGER,
  "scenario" "ClinicScenario",
  "minRequiredSlots" INTEGER NOT NULL DEFAULT 1,
  "desiredSlots" INTEGER NOT NULL DEFAULT 1,
  "maxSlots" INTEGER NOT NULL DEFAULT 1,
  "requirementLevel" "TaskSlotRequirementLevel" NOT NULL DEFAULT 'DESIRED',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "effectiveStartDate" DATE,
  "effectiveEndDate" DATE,
  "notes" TEXT,
  "createdByEmployeeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffingRequirementRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskSlot_staffingRequirementRuleId_idx" ON "TaskSlot"("staffingRequirementRuleId");
CREATE INDEX "StaffingRequirementRule_active_taskTypeId_idx" ON "StaffingRequirementRule"("active", "taskTypeId");
CREATE INDEX "StaffingRequirementRule_weekday_scenario_idx" ON "StaffingRequirementRule"("weekday", "scenario");
CREATE INDEX "StaffingRequirementRule_effectiveStartDate_effectiveEndDate_idx" ON "StaffingRequirementRule"("effectiveStartDate", "effectiveEndDate");

ALTER TABLE "TaskSlot"
  ADD CONSTRAINT "TaskSlot_staffingRequirementRuleId_fkey"
  FOREIGN KEY ("staffingRequirementRuleId") REFERENCES "StaffingRequirementRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffingRequirementRule"
  ADD CONSTRAINT "StaffingRequirementRule_taskTypeId_fkey"
  FOREIGN KEY ("taskTypeId") REFERENCES "TaskType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffingRequirementRule"
  ADD CONSTRAINT "StaffingRequirementRule_createdByEmployeeId_fkey"
  FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
