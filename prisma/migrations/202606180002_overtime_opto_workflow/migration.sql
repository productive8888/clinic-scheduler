ALTER TYPE "PayrollAdjustmentType" ADD VALUE 'OVERTIME_PAYABLE';

CREATE TABLE "OvertimeRequest" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "workDate" DATE NOT NULL,
  "requestedHours" DECIMAL(8, 2) NOT NULL,
  "reason" TEXT,
  "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedByEmployeeId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "optoAppliedHours" DECIMAL(8, 2) NOT NULL DEFAULT 0,
  "payableOvertimeHours" DECIMAL(8, 2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OvertimeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OvertimeRequest_employeeId_workDate_idx"
  ON "OvertimeRequest"("employeeId", "workDate");
CREATE INDEX "OvertimeRequest_status_workDate_idx"
  ON "OvertimeRequest"("status", "workDate");
CREATE INDEX "OvertimeRequest_reviewedByEmployeeId_idx"
  ON "OvertimeRequest"("reviewedByEmployeeId");

ALTER TABLE "OvertimeRequest"
  ADD CONSTRAINT "OvertimeRequest_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OvertimeRequest"
  ADD CONSTRAINT "OvertimeRequest_reviewedByEmployeeId_fkey"
  FOREIGN KEY ("reviewedByEmployeeId") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OptoLedgerEntry"
  ADD COLUMN "sourceEntityType" TEXT,
  ADD COLUMN "sourceEntityId" TEXT;

CREATE INDEX "OptoLedgerEntry_sourceEntityType_sourceEntityId_idx"
  ON "OptoLedgerEntry"("sourceEntityType", "sourceEntityId");
