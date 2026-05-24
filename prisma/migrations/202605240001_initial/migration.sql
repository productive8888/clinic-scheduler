-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('EMPLOYEE', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PTORequestType" AS ENUM ('PTO', 'ABSENCE', 'UNAVAILABILITY', 'SCHEDULE_CHANGE');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScheduleDayStatus" AS ENUM ('DRAFT', 'GENERATED', 'PUBLISHED', 'LOCKED');

-- CreateEnum
CREATE TYPE "TaskSlotStatus" AS ENUM ('OPEN', 'FILLED', 'SHORTAGE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('GENERATED', 'MANUAL_OVERRIDE', 'COVERAGE_REPLACEMENT', 'IMPORTED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'REMOVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SchedulingRuleType" AS ENUM ('PREFER_EMPLOYEE_TASK', 'AVOID_EMPLOYEE_TASK', 'PRIORITY_BOOST', 'PREFERRED_DAY', 'MIN_ASSIGNMENTS', 'MAX_ASSIGNMENTS', 'BACKUP_ONLY', 'SKILL_WEIGHT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExportType" AS ENUM ('GOOGLE_CALENDAR', 'GOOGLE_SHEETS', 'PRINTABLE');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('QUEUED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "authProviderId" TEXT,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "EmployeeRole" NOT NULL DEFAULT 'EMPLOYEE',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "ptoBalanceHours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "weeklyAssignmentLimit" INTEGER,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSkill" (
    "employeeId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeSkill_pkey" PRIMARY KEY ("employeeId","skillId")
);

-- CreateTable
CREATE TABLE "TaskType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "interchangeableGroup" TEXT,
    "difficultyWeight" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSkillRequirement" (
    "id" TEXT NOT NULL,
    "taskTypeId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TaskSkillRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyAvailability" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "effectiveStartDate" DATE NOT NULL,
    "effectiveEndDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PTORequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "PTORequestType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "reason" TEXT,
    "managerNote" TEXT,
    "reviewedByEmployeeId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PTORequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleDay" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "ScheduleDayStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSlot" (
    "id" TEXT NOT NULL,
    "scheduleDayId" TEXT NOT NULL,
    "taskTypeId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "minStaff" INTEGER NOT NULL DEFAULT 1,
    "requiredStaff" INTEGER NOT NULL DEFAULT 1,
    "status" "TaskSlotStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "taskSlotId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "source" "AssignmentSource" NOT NULL DEFAULT 'GENERATED',
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "assignedByEmployeeId" TEXT,
    "generationRunId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulingRule" (
    "id" TEXT NOT NULL,
    "type" "SchedulingRuleType" NOT NULL,
    "employeeId" TEXT,
    "taskTypeId" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveStartDate" DATE,
    "effectiveEndDate" DATE,
    "parameters" JSONB,
    "createdByEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleGenerationRun" (
    "id" TEXT NOT NULL,
    "dateStart" DATE NOT NULL,
    "dateEnd" DATE NOT NULL,
    "seed" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByEmployeeId" TEXT,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduleGenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorEmployeeId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportLog" (
    "id" TEXT NOT NULL,
    "type" "ExportType" NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedByEmployeeId" TEXT,
    "scheduleDayId" TEXT,
    "outputUrl" TEXT,
    "metadata" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ExportLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_authProviderId_key" ON "Employee"("authProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "Employee_status_idx" ON "Employee"("status");

-- CreateIndex
CREATE INDEX "Employee_role_idx" ON "Employee"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_code_key" ON "Skill"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TaskType_code_key" ON "TaskType"("code");

-- CreateIndex
CREATE INDEX "TaskType_active_sortOrder_idx" ON "TaskType"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "TaskType_interchangeableGroup_idx" ON "TaskType"("interchangeableGroup");

-- CreateIndex
CREATE UNIQUE INDEX "TaskSkillRequirement_taskTypeId_skillId_key" ON "TaskSkillRequirement"("taskTypeId", "skillId");

-- CreateIndex
CREATE INDEX "WeeklyAvailability_employeeId_weekday_active_idx" ON "WeeklyAvailability"("employeeId", "weekday", "active");

-- CreateIndex
CREATE INDEX "PTORequest_employeeId_status_startDate_endDate_idx" ON "PTORequest"("employeeId", "status", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "PTORequest_status_idx" ON "PTORequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleDay_date_key" ON "ScheduleDay"("date");

-- CreateIndex
CREATE INDEX "TaskSlot_scheduleDayId_status_idx" ON "TaskSlot"("scheduleDayId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TaskSlot_scheduleDayId_taskTypeId_slotIndex_key" ON "TaskSlot"("scheduleDayId", "taskTypeId", "slotIndex");

-- CreateIndex
CREATE INDEX "Assignment_employeeId_status_idx" ON "Assignment"("employeeId", "status");

-- CreateIndex
CREATE INDEX "Assignment_taskSlotId_status_idx" ON "Assignment"("taskSlotId", "status");

-- CreateIndex
CREATE INDEX "Assignment_generationRunId_idx" ON "Assignment"("generationRunId");

-- CreateIndex
CREATE INDEX "SchedulingRule_active_type_idx" ON "SchedulingRule"("active", "type");

-- CreateIndex
CREATE INDEX "SchedulingRule_employeeId_taskTypeId_idx" ON "SchedulingRule"("employeeId", "taskTypeId");

-- CreateIndex
CREATE INDEX "ScheduleGenerationRun_dateStart_dateEnd_idx" ON "ScheduleGenerationRun"("dateStart", "dateEnd");

-- CreateIndex
CREATE INDEX "ScheduleGenerationRun_status_idx" ON "ScheduleGenerationRun"("status");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorEmployeeId_idx" ON "AuditLog"("actorEmployeeId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ExportLog_type_status_idx" ON "ExportLog"("type", "status");

-- AddForeignKey
ALTER TABLE "EmployeeSkill" ADD CONSTRAINT "EmployeeSkill_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSkill" ADD CONSTRAINT "EmployeeSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSkillRequirement" ADD CONSTRAINT "TaskSkillRequirement_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "TaskType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSkillRequirement" ADD CONSTRAINT "TaskSkillRequirement_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyAvailability" ADD CONSTRAINT "WeeklyAvailability_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PTORequest" ADD CONSTRAINT "PTORequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PTORequest" ADD CONSTRAINT "PTORequest_reviewedByEmployeeId_fkey" FOREIGN KEY ("reviewedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSlot" ADD CONSTRAINT "TaskSlot_scheduleDayId_fkey" FOREIGN KEY ("scheduleDayId") REFERENCES "ScheduleDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSlot" ADD CONSTRAINT "TaskSlot_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "TaskType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_taskSlotId_fkey" FOREIGN KEY ("taskSlotId") REFERENCES "TaskSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_assignedByEmployeeId_fkey" FOREIGN KEY ("assignedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "ScheduleGenerationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingRule" ADD CONSTRAINT "SchedulingRule_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingRule" ADD CONSTRAINT "SchedulingRule_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "TaskType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingRule" ADD CONSTRAINT "SchedulingRule_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleGenerationRun" ADD CONSTRAINT "ScheduleGenerationRun_requestedByEmployeeId_fkey" FOREIGN KEY ("requestedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorEmployeeId_fkey" FOREIGN KEY ("actorEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportLog" ADD CONSTRAINT "ExportLog_requestedByEmployeeId_fkey" FOREIGN KEY ("requestedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

