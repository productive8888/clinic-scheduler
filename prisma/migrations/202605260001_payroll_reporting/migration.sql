CREATE TYPE "HolidayPayRule" AS ENUM (
  'PAID_HOLIDAY',
  'BANK_AS_COMP_TIME',
  'BANK_AS_PTO',
  'UNPAID'
);

CREATE TYPE "PayrollAdjustmentType" AS ENUM (
  'PTO_DEBIT',
  'PTO_CREDIT',
  'NPTO_UNPAID_DEDUCTION',
  'PAID_HOLIDAY_CREDIT',
  'COMP_TIME_CREDIT',
  'COMP_TIME_DEBIT',
  'MANUAL_ADJUSTMENT',
  'REVERSAL_ADJUSTMENT'
);

ALTER TABLE "Employee"
  ADD COLUMN "expectedWeeklyHours" DECIMAL(6, 2) NOT NULL DEFAULT 40,
  ADD COLUMN "compTimeBalanceHours" DECIMAL(7, 2) NOT NULL DEFAULT 0;

CREATE TABLE "PayrollSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "defaultPayrollPeriodDays" INTEGER NOT NULL DEFAULT 14,
  "fullTimeWeeklyHours" DECIMAL(6, 2) NOT NULL DEFAULT 40,
  "paidHolidayDefaultHours" DECIMAL(6, 2) NOT NULL DEFAULT 8,
  "compTimeBankingEnabled" BOOLEAN NOT NULL DEFAULT false,
  "bankOverExpectedHours" BOOLEAN NOT NULL DEFAULT false,
  "deductUnderExpectedHours" BOOLEAN NOT NULL DEFAULT false,
  "flagUnderExpectedHours" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PayrollSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaidHoliday" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "name" TEXT NOT NULL,
  "hours" DECIMAL(6, 2) NOT NULL DEFAULT 8,
  "rule" "HolidayPayRule" NOT NULL DEFAULT 'PAID_HOLIDAY',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdByEmployeeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaidHoliday_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PayrollAdjustmentLedger" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "type" "PayrollAdjustmentType" NOT NULL,
  "hours" DECIMAL(8, 2) NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "periodStartDate" DATE,
  "periodEndDate" DATE,
  "sourceEntityType" TEXT,
  "sourceEntityId" TEXT,
  "createdByEmployeeId" TEXT,
  "metadata" JSONB,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PayrollAdjustmentLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaidHoliday_date_key" ON "PaidHoliday"("date");
CREATE INDEX "PaidHoliday_date_active_idx" ON "PaidHoliday"("date", "active");
CREATE INDEX "PaidHoliday_createdByEmployeeId_idx" ON "PaidHoliday"("createdByEmployeeId");

CREATE UNIQUE INDEX "PayrollAdjustmentLedger_employeeId_type_sourceEntityType_sourceEntityId_key"
  ON "PayrollAdjustmentLedger"("employeeId", "type", "sourceEntityType", "sourceEntityId");
CREATE INDEX "PayrollAdjustmentLedger_employeeId_effectiveDate_idx"
  ON "PayrollAdjustmentLedger"("employeeId", "effectiveDate");
CREATE INDEX "PayrollAdjustmentLedger_periodStartDate_periodEndDate_idx"
  ON "PayrollAdjustmentLedger"("periodStartDate", "periodEndDate");
CREATE INDEX "PayrollAdjustmentLedger_type_idx" ON "PayrollAdjustmentLedger"("type");
CREATE INDEX "PayrollAdjustmentLedger_sourceEntityType_sourceEntityId_idx"
  ON "PayrollAdjustmentLedger"("sourceEntityType", "sourceEntityId");
CREATE INDEX "PayrollAdjustmentLedger_createdByEmployeeId_idx"
  ON "PayrollAdjustmentLedger"("createdByEmployeeId");

ALTER TABLE "PaidHoliday"
  ADD CONSTRAINT "PaidHoliday_createdByEmployeeId_fkey"
  FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PayrollAdjustmentLedger"
  ADD CONSTRAINT "PayrollAdjustmentLedger_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollAdjustmentLedger"
  ADD CONSTRAINT "PayrollAdjustmentLedger_createdByEmployeeId_fkey"
  FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "PayrollSettings" ("id", "updatedAt")
VALUES ('default', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
