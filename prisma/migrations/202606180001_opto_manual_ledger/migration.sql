CREATE TYPE "OptoAdjustmentType" AS ENUM (
  'CREDIT',
  'DEBIT',
  'SET_BALANCE',
  'CORRECTION'
);

ALTER TABLE "Employee"
  ADD COLUMN "optoBalanceHours" DECIMAL(8, 2) NOT NULL DEFAULT 0;

CREATE TABLE "OptoLedgerEntry" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "adjustmentHours" DECIMAL(8, 2) NOT NULL,
  "balanceBefore" DECIMAL(8, 2) NOT NULL,
  "balanceAfter" DECIMAL(8, 2) NOT NULL,
  "adjustmentType" "OptoAdjustmentType" NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "createdByEmployeeId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OptoLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OptoLedgerEntry_employeeId_effectiveDate_createdAt_idx"
  ON "OptoLedgerEntry"("employeeId", "effectiveDate", "createdAt");
CREATE INDEX "OptoLedgerEntry_effectiveDate_idx"
  ON "OptoLedgerEntry"("effectiveDate");
CREATE INDEX "OptoLedgerEntry_adjustmentType_idx"
  ON "OptoLedgerEntry"("adjustmentType");
CREATE INDEX "OptoLedgerEntry_createdByEmployeeId_idx"
  ON "OptoLedgerEntry"("createdByEmployeeId");

ALTER TABLE "OptoLedgerEntry"
  ADD CONSTRAINT "OptoLedgerEntry_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OptoLedgerEntry"
  ADD CONSTRAINT "OptoLedgerEntry_createdByEmployeeId_fkey"
  FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
