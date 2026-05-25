CREATE TABLE "NPTORequest" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "startMinute" INTEGER,
  "endMinute" INTEGER,
  "requestedHours" DECIMAL(8,2) NOT NULL,
  "unpaidHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "capSnapshotHours" DECIMAL(8,2) NOT NULL DEFAULT 240,
  "usedHoursAtSubmission" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "shortNotice" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "denialReason" TEXT,
  "managerNote" TEXT,
  "reviewedByEmployeeId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "payrollProcessedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NPTORequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TimeOffSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "nptoCapHours" DECIMAL(8,2) NOT NULL DEFAULT 240,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TimeOffSettings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NPTORequest_employeeId_status_startDate_endDate_idx" ON "NPTORequest"("employeeId", "status", "startDate", "endDate");
CREATE INDEX "NPTORequest_status_idx" ON "NPTORequest"("status");

ALTER TABLE "NPTORequest"
  ADD CONSTRAINT "NPTORequest_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NPTORequest"
  ADD CONSTRAINT "NPTORequest_reviewedByEmployeeId_fkey"
  FOREIGN KEY ("reviewedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "TimeOffSettings" ("id", "nptoCapHours", "updatedAt")
VALUES ('default', 240, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
