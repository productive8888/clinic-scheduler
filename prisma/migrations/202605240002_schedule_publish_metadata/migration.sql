-- Add publish metadata to schedule days.
ALTER TABLE "ScheduleDay"
ADD COLUMN "publishedAt" TIMESTAMP(3),
ADD COLUMN "publishedByEmployeeId" TEXT;

CREATE INDEX "ScheduleDay_publishedByEmployeeId_idx" ON "ScheduleDay"("publishedByEmployeeId");

ALTER TABLE "ScheduleDay"
ADD CONSTRAINT "ScheduleDay_publishedByEmployeeId_fkey"
FOREIGN KEY ("publishedByEmployeeId") REFERENCES "Employee"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
