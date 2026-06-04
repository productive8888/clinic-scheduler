ALTER TABLE "BackgroundTaskDefinition"
  ADD COLUMN "taskTypeId" TEXT,
  ADD COLUMN "requiredCountPerPeriod" INTEGER;

ALTER TABLE "BackgroundTaskInstance"
  ADD COLUMN "dueDate" DATE;

ALTER TABLE "TaskSlot"
  ADD COLUMN "backgroundTaskInstanceId" TEXT;

CREATE INDEX "BackgroundTaskDefinition_taskTypeId_active_idx"
  ON "BackgroundTaskDefinition"("taskTypeId", "active");

CREATE INDEX "TaskSlot_backgroundTaskInstanceId_idx"
  ON "TaskSlot"("backgroundTaskInstanceId");

ALTER TABLE "BackgroundTaskDefinition"
  ADD CONSTRAINT "BackgroundTaskDefinition_taskTypeId_fkey"
  FOREIGN KEY ("taskTypeId") REFERENCES "TaskType"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskSlot"
  ADD CONSTRAINT "TaskSlot_backgroundTaskInstanceId_fkey"
  FOREIGN KEY ("backgroundTaskInstanceId") REFERENCES "BackgroundTaskInstance"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
