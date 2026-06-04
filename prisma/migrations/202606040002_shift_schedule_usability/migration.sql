ALTER TYPE "ScheduleDayStatus" ADD VALUE IF NOT EXISTS 'NEEDS_REGENERATION';

UPDATE "ShiftTemplate"
SET
  "active" = false,
  "defaultForSchedule" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'legacy-default-shift-template';
