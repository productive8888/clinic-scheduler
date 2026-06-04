-- Ensure spreadsheet-derived schedules have one safe default shift per active day.
UPDATE "ShiftTemplate"
SET "defaultForSchedule" = true
WHERE "active" = true
  AND "startMinute" = 480
  AND "dayOfWeek" BETWEEN 1 AND 6
  AND (
    "notes" ILIKE '%Easton spreadsheet%'
    OR "name" LIKE '%0800-%'
  );

UPDATE "ShiftBlock" AS block
SET "defaultForSchedule" = true
FROM "ShiftTemplate" AS template
WHERE block."shiftTemplateId" = template."id"
  AND block."active" = true
  AND template."defaultForSchedule" = true;
