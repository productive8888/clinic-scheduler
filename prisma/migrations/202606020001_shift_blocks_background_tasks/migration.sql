CREATE TYPE "ShiftCategory" AS ENUM (
  'AM',
  'PM',
  'SATURDAY',
  'ENDO',
  'FLOAT',
  'OTHER'
);

CREATE TYPE "FairnessWindowType" AS ENUM (
  'TWO_WEEKS',
  'ONE_MONTH',
  'CUSTOM'
);

CREATE TYPE "BackgroundTaskPeriodType" AS ENUM (
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'CUSTOM'
);

ALTER TABLE "TaskType"
  ADD COLUMN "isClinical" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isBackground" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isSkilled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isEndoscopy" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isFloat" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ShiftTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "dayOfWeek" INTEGER,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "paidHours" DECIMAL(6, 2) NOT NULL,
  "shiftCategory" "ShiftCategory" NOT NULL DEFAULT 'OTHER',
  "defaultForSchedule" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "effectiveStartDate" DATE,
  "effectiveEndDate" DATE,
  "notes" TEXT,
  "createdByEmployeeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShiftTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShiftBlock" (
  "id" TEXT NOT NULL,
  "scheduleDayId" TEXT NOT NULL,
  "shiftTemplateId" TEXT,
  "name" TEXT NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "paidHours" DECIMAL(6, 2) NOT NULL,
  "shiftCategory" "ShiftCategory" NOT NULL DEFAULT 'OTHER',
  "defaultForSchedule" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT NOT NULL DEFAULT 'TEMPLATE',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShiftBlock_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TaskSlot"
  ADD COLUMN "shiftBlockId" TEXT;

INSERT INTO "ShiftTemplate" (
  "id",
  "name",
  "dayOfWeek",
  "startMinute",
  "endMinute",
  "paidHours",
  "shiftCategory",
  "defaultForSchedule",
  "active",
  "notes",
  "createdAt",
  "updatedAt"
)
VALUES (
  'legacy-default-shift-template',
  'Legacy full-day shift',
  NULL,
  480,
  1020,
  9,
  'OTHER',
  true,
  true,
  'Migration fallback for schedules created before shift blocks.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT INTO "ShiftBlock" (
  "id",
  "scheduleDayId",
  "shiftTemplateId",
  "name",
  "startMinute",
  "endMinute",
  "paidHours",
  "shiftCategory",
  "defaultForSchedule",
  "source",
  "active",
  "notes",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy-shift-block-' || "id",
  "id",
  'legacy-default-shift-template',
  'Legacy full-day shift',
  480,
  1020,
  9,
  'OTHER',
  true,
  'MIGRATION',
  true,
  'Migration fallback for schedules created before shift blocks.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "ScheduleDay";

UPDATE "TaskSlot"
SET "shiftBlockId" = 'legacy-shift-block-' || "scheduleDayId"
WHERE "shiftBlockId" IS NULL;

ALTER TABLE "TaskSlot"
  ALTER COLUMN "shiftBlockId" SET NOT NULL;

DROP INDEX "TaskSlot_scheduleDayId_taskTypeId_slotIndex_key";

ALTER TABLE "StaffingRequirementRule"
  ADD COLUMN "shiftTemplateId" TEXT,
  ADD COLUMN "shiftCategory" "ShiftCategory";

CREATE TABLE "FairnessSetting" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "windowType" "FairnessWindowType" NOT NULL DEFAULT 'TWO_WEEKS',
  "customStartDate" DATE,
  "customEndDate" DATE,
  "clinicalShiftWeight" INTEGER NOT NULL DEFAULT 20,
  "totalShiftWeight" INTEGER NOT NULL DEFAULT 10,
  "totalHoursWeight" INTEGER NOT NULL DEFAULT 8,
  "saturdayShiftWeight" INTEGER NOT NULL DEFAULT 12,
  "endoscopyShiftWeight" INTEGER NOT NULL DEFAULT 12,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FairnessSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShortageRule" (
  "id" TEXT NOT NULL,
  "taskTypeId" TEXT,
  "shiftTemplateId" TEXT,
  "shiftCategory" "ShiftCategory",
  "scenario" "ClinicScenario",
  "closurePriority" INTEGER NOT NULL DEFAULT 100,
  "managerInstruction" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "effectiveStartDate" DATE,
  "effectiveEndDate" DATE,
  "notes" TEXT,
  "createdByEmployeeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShortageRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackgroundTaskCategory" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BackgroundTaskCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackgroundTaskDefinition" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "estimatedHoursPerPeriod" DECIMAL(6, 2) NOT NULL,
  "periodType" "BackgroundTaskPeriodType" NOT NULL DEFAULT 'WEEKLY',
  "customPeriodDays" INTEGER,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "mentor" TEXT,
  "primaryOwnerEmployeeId" TEXT,
  "canBePulledForClinic" BOOLEAN NOT NULL DEFAULT false,
  "rolloverAllowed" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdByEmployeeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BackgroundTaskDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackgroundTaskEligibleEmployee" (
  "definitionId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,

  CONSTRAINT "BackgroundTaskEligibleEmployee_pkey" PRIMARY KEY ("definitionId", "employeeId")
);

CREATE TABLE "BackgroundTaskRequiredSkill" (
  "definitionId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,

  CONSTRAINT "BackgroundTaskRequiredSkill_pkey" PRIMARY KEY ("definitionId", "skillId")
);

CREATE TABLE "BackgroundTaskInstance" (
  "id" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "periodStartDate" DATE NOT NULL,
  "periodEndDate" DATE NOT NULL,
  "estimatedHours" DECIMAL(6, 2) NOT NULL,
  "prioritySnapshot" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BackgroundTaskInstance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskType_isClinical_isBackground_idx" ON "TaskType"("isClinical", "isBackground");

CREATE UNIQUE INDEX "TaskSlot_scheduleDayId_shiftBlockId_taskTypeId_slotIndex_key"
  ON "TaskSlot"("scheduleDayId", "shiftBlockId", "taskTypeId", "slotIndex");
CREATE INDEX "TaskSlot_shiftBlockId_idx" ON "TaskSlot"("shiftBlockId");

CREATE INDEX "ShiftTemplate_active_dayOfWeek_idx" ON "ShiftTemplate"("active", "dayOfWeek");
CREATE INDEX "ShiftTemplate_shiftCategory_active_idx" ON "ShiftTemplate"("shiftCategory", "active");
CREATE INDEX "ShiftTemplate_defaultForSchedule_idx" ON "ShiftTemplate"("defaultForSchedule");
CREATE INDEX "ShiftTemplate_effectiveStartDate_effectiveEndDate_idx" ON "ShiftTemplate"("effectiveStartDate", "effectiveEndDate");
CREATE INDEX "ShiftTemplate_createdByEmployeeId_idx" ON "ShiftTemplate"("createdByEmployeeId");

CREATE UNIQUE INDEX "ShiftBlock_scheduleDayId_shiftTemplateId_key" ON "ShiftBlock"("scheduleDayId", "shiftTemplateId");
CREATE INDEX "ShiftBlock_scheduleDayId_active_idx" ON "ShiftBlock"("scheduleDayId", "active");
CREATE INDEX "ShiftBlock_shiftTemplateId_idx" ON "ShiftBlock"("shiftTemplateId");
CREATE INDEX "ShiftBlock_shiftCategory_startMinute_idx" ON "ShiftBlock"("shiftCategory", "startMinute");

CREATE INDEX "StaffingRequirementRule_shiftTemplateId_shiftCategory_idx"
  ON "StaffingRequirementRule"("shiftTemplateId", "shiftCategory");

CREATE INDEX "ShortageRule_active_closurePriority_idx" ON "ShortageRule"("active", "closurePriority");
CREATE INDEX "ShortageRule_taskTypeId_shiftTemplateId_shiftCategory_idx"
  ON "ShortageRule"("taskTypeId", "shiftTemplateId", "shiftCategory");
CREATE INDEX "ShortageRule_scenario_idx" ON "ShortageRule"("scenario");
CREATE INDEX "ShortageRule_effectiveStartDate_effectiveEndDate_idx" ON "ShortageRule"("effectiveStartDate", "effectiveEndDate");
CREATE INDEX "ShortageRule_createdByEmployeeId_idx" ON "ShortageRule"("createdByEmployeeId");

CREATE UNIQUE INDEX "BackgroundTaskCategory_code_key" ON "BackgroundTaskCategory"("code");
CREATE INDEX "BackgroundTaskCategory_active_sortOrder_idx" ON "BackgroundTaskCategory"("active", "sortOrder");
CREATE INDEX "BackgroundTaskDefinition_categoryId_active_idx" ON "BackgroundTaskDefinition"("categoryId", "active");
CREATE INDEX "BackgroundTaskDefinition_priority_active_idx" ON "BackgroundTaskDefinition"("priority", "active");
CREATE INDEX "BackgroundTaskDefinition_primaryOwnerEmployeeId_idx" ON "BackgroundTaskDefinition"("primaryOwnerEmployeeId");
CREATE INDEX "BackgroundTaskDefinition_createdByEmployeeId_idx" ON "BackgroundTaskDefinition"("createdByEmployeeId");
CREATE UNIQUE INDEX "BackgroundTaskInstance_definitionId_periodStartDate_periodEndDate_key"
  ON "BackgroundTaskInstance"("definitionId", "periodStartDate", "periodEndDate");
CREATE INDEX "BackgroundTaskInstance_periodStartDate_periodEndDate_idx" ON "BackgroundTaskInstance"("periodStartDate", "periodEndDate");
CREATE INDEX "BackgroundTaskInstance_status_idx" ON "BackgroundTaskInstance"("status");

ALTER TABLE "ShiftTemplate"
  ADD CONSTRAINT "ShiftTemplate_createdByEmployeeId_fkey"
  FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ShiftBlock"
  ADD CONSTRAINT "ShiftBlock_scheduleDayId_fkey"
  FOREIGN KEY ("scheduleDayId") REFERENCES "ScheduleDay"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShiftBlock"
  ADD CONSTRAINT "ShiftBlock_shiftTemplateId_fkey"
  FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskSlot"
  ADD CONSTRAINT "TaskSlot_shiftBlockId_fkey"
  FOREIGN KEY ("shiftBlockId") REFERENCES "ShiftBlock"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffingRequirementRule"
  ADD CONSTRAINT "StaffingRequirementRule_shiftTemplateId_fkey"
  FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ShortageRule"
  ADD CONSTRAINT "ShortageRule_taskTypeId_fkey"
  FOREIGN KEY ("taskTypeId") REFERENCES "TaskType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShortageRule"
  ADD CONSTRAINT "ShortageRule_shiftTemplateId_fkey"
  FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ShortageRule"
  ADD CONSTRAINT "ShortageRule_createdByEmployeeId_fkey"
  FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BackgroundTaskDefinition"
  ADD CONSTRAINT "BackgroundTaskDefinition_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "BackgroundTaskCategory"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BackgroundTaskDefinition"
  ADD CONSTRAINT "BackgroundTaskDefinition_primaryOwnerEmployeeId_fkey"
  FOREIGN KEY ("primaryOwnerEmployeeId") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BackgroundTaskDefinition"
  ADD CONSTRAINT "BackgroundTaskDefinition_createdByEmployeeId_fkey"
  FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BackgroundTaskEligibleEmployee"
  ADD CONSTRAINT "BackgroundTaskEligibleEmployee_definitionId_fkey"
  FOREIGN KEY ("definitionId") REFERENCES "BackgroundTaskDefinition"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BackgroundTaskEligibleEmployee"
  ADD CONSTRAINT "BackgroundTaskEligibleEmployee_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BackgroundTaskRequiredSkill"
  ADD CONSTRAINT "BackgroundTaskRequiredSkill_definitionId_fkey"
  FOREIGN KEY ("definitionId") REFERENCES "BackgroundTaskDefinition"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BackgroundTaskRequiredSkill"
  ADD CONSTRAINT "BackgroundTaskRequiredSkill_skillId_fkey"
  FOREIGN KEY ("skillId") REFERENCES "Skill"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BackgroundTaskInstance"
  ADD CONSTRAINT "BackgroundTaskInstance_definitionId_fkey"
  FOREIGN KEY ("definitionId") REFERENCES "BackgroundTaskDefinition"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "FairnessSetting" ("id", "updatedAt")
VALUES ('default', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
