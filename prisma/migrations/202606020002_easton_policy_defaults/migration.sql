CREATE TYPE "WorkPatternKind" AS ENUM ('CUSTOM', 'ENDOSCOPY_SATURDAY', 'NON_ENDOSCOPY_SATURDAY');
CREATE TYPE "EndoscopyCompPolicy" AS ENUM ('BANK_PTO', 'BANK_COMP_TIME', 'FLAG_ONLY');

ALTER TABLE "Employee" ADD COLUMN "workPatternId" TEXT;

ALTER TABLE "TaskType"
  ADD COLUMN "isPatientFacing" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isClosureCandidate" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PayrollSettings"
  ADD COLUMN "endoscopyExtraHoursPolicy" "EndoscopyCompPolicy" NOT NULL DEFAULT 'BANK_PTO',
  ADD COLUMN "endoscopyShortenShiftSuggestions" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "FairnessSetting"
  ADD COLUMN "patternConsistencyWeight" INTEGER NOT NULL DEFAULT 35,
  ADD COLUMN "patientFacingShiftWeight" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "skillRoleBalanceWeight" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "exposureGoalWeight" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "backgroundPenaltyWeight" INTEGER NOT NULL DEFAULT 20;

ALTER TABLE "BackgroundTaskDefinition"
  ADD COLUMN "protectedFromPull" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "WorkPattern" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "WorkPatternKind" NOT NULL DEFAULT 'CUSTOM',
  "targetWeeklyHours" DECIMAL(6,2) NOT NULL DEFAULT 40,
  "worksTuesdayThroughSaturday" BOOLEAN NOT NULL DEFAULT false,
  "saturdayPaidHours" DECIMAL(6,2),
  "mondayOffAllowed" BOOLEAN NOT NULL DEFAULT false,
  "fridayOffAllowed" BOOLEAN NOT NULL DEFAULT false,
  "earlyStartDaysPerWeek" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdByEmployeeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkPattern_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackgroundPullRule" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "priorityRank" INTEGER NOT NULL,
  "maxPullsPerPeriod" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "effectiveStartDate" DATE,
  "effectiveEndDate" DATE,
  "notes" TEXT,
  "createdByEmployeeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BackgroundPullRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchedulePattern" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "effectiveStartDate" DATE,
  "effectiveEndDate" DATE,
  "createdByEmployeeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchedulePattern_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchedulePatternSlot" (
  "id" TEXT NOT NULL,
  "patternId" TEXT NOT NULL,
  "weekday" INTEGER NOT NULL,
  "shiftTemplateId" TEXT,
  "shiftCategory" "ShiftCategory",
  "taskTypeId" TEXT NOT NULL,
  "slotIndex" INTEGER NOT NULL DEFAULT 1,
  "preferredEmployeeId" TEXT,
  "requirementLevel" "TaskSlotRequirementLevel" NOT NULL DEFAULT 'REQUIRED',
  "sourceLabel" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchedulePatternSlot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeScheduleTarget" (
  "id" TEXT NOT NULL,
  "patternId" TEXT,
  "employeeId" TEXT,
  "employeeName" TEXT NOT NULL,
  "periodLabel" TEXT,
  "targetPatientShifts" DECIMAL(8,2),
  "targetTotalHours" DECIMAL(8,2),
  "targetTaskCounts" JSONB,
  "exposureGoals" JSONB,
  "source" TEXT NOT NULL DEFAULT 'EASTON_SPREADSHEET',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeScheduleTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EastonImportReview" (
  "id" TEXT NOT NULL,
  "sourcePath" TEXT NOT NULL,
  "workbookModifiedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PARSED',
  "summary" JSONB NOT NULL,
  "warnings" JSONB,
  "createdByEmployeeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMP(3),
  CONSTRAINT "EastonImportReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkPattern_code_key" ON "WorkPattern"("code");
CREATE INDEX "WorkPattern_active_kind_idx" ON "WorkPattern"("active", "kind");
CREATE INDEX "WorkPattern_createdByEmployeeId_idx" ON "WorkPattern"("createdByEmployeeId");

CREATE UNIQUE INDEX "BackgroundPullRule_employeeId_key" ON "BackgroundPullRule"("employeeId");
CREATE INDEX "BackgroundPullRule_active_priorityRank_idx" ON "BackgroundPullRule"("active", "priorityRank");
CREATE INDEX "BackgroundPullRule_effectiveStartDate_effectiveEndDate_idx" ON "BackgroundPullRule"("effectiveStartDate", "effectiveEndDate");
CREATE INDEX "BackgroundPullRule_createdByEmployeeId_idx" ON "BackgroundPullRule"("createdByEmployeeId");

CREATE UNIQUE INDEX "SchedulePattern_code_key" ON "SchedulePattern"("code");
CREATE INDEX "SchedulePattern_active_source_idx" ON "SchedulePattern"("active", "source");
CREATE INDEX "SchedulePattern_effectiveStartDate_effectiveEndDate_idx" ON "SchedulePattern"("effectiveStartDate", "effectiveEndDate");
CREATE INDEX "SchedulePattern_createdByEmployeeId_idx" ON "SchedulePattern"("createdByEmployeeId");

CREATE INDEX "SchedulePatternSlot_patternId_weekday_idx" ON "SchedulePatternSlot"("patternId", "weekday");
CREATE INDEX "SchedulePatternSlot_shiftTemplateId_shiftCategory_idx" ON "SchedulePatternSlot"("shiftTemplateId", "shiftCategory");
CREATE INDEX "SchedulePatternSlot_taskTypeId_idx" ON "SchedulePatternSlot"("taskTypeId");
CREATE INDEX "SchedulePatternSlot_preferredEmployeeId_idx" ON "SchedulePatternSlot"("preferredEmployeeId");

CREATE INDEX "EmployeeScheduleTarget_patternId_idx" ON "EmployeeScheduleTarget"("patternId");
CREATE INDEX "EmployeeScheduleTarget_employeeId_idx" ON "EmployeeScheduleTarget"("employeeId");
CREATE INDEX "EmployeeScheduleTarget_employeeName_idx" ON "EmployeeScheduleTarget"("employeeName");

CREATE INDEX "EastonImportReview_status_createdAt_idx" ON "EastonImportReview"("status", "createdAt");
CREATE INDEX "EastonImportReview_createdByEmployeeId_idx" ON "EastonImportReview"("createdByEmployeeId");

CREATE INDEX "Employee_workPatternId_idx" ON "Employee"("workPatternId");
CREATE INDEX "TaskType_isPatientFacing_isClinical_isBackground_idx" ON "TaskType"("isPatientFacing", "isClinical", "isBackground");
CREATE INDEX "TaskType_isClosureCandidate_idx" ON "TaskType"("isClosureCandidate");

ALTER TABLE "Employee" ADD CONSTRAINT "Employee_workPatternId_fkey" FOREIGN KEY ("workPatternId") REFERENCES "WorkPattern"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkPattern" ADD CONSTRAINT "WorkPattern_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BackgroundPullRule" ADD CONSTRAINT "BackgroundPullRule_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackgroundPullRule" ADD CONSTRAINT "BackgroundPullRule_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchedulePattern" ADD CONSTRAINT "SchedulePattern_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchedulePatternSlot" ADD CONSTRAINT "SchedulePatternSlot_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "SchedulePattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchedulePatternSlot" ADD CONSTRAINT "SchedulePatternSlot_shiftTemplateId_fkey" FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchedulePatternSlot" ADD CONSTRAINT "SchedulePatternSlot_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "TaskType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchedulePatternSlot" ADD CONSTRAINT "SchedulePatternSlot_preferredEmployeeId_fkey" FOREIGN KEY ("preferredEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeScheduleTarget" ADD CONSTRAINT "EmployeeScheduleTarget_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "SchedulePattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeScheduleTarget" ADD CONSTRAINT "EmployeeScheduleTarget_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EastonImportReview" ADD CONSTRAINT "EastonImportReview_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
