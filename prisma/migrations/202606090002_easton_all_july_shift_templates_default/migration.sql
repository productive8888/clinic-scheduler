-- July generation treats every Shifts + Hours column as an active generated
-- shift block. Older data only marked 8:00 AM Easton shifts as defaults, which
-- made 7:00 AM, Monday 1:00-6:00 PM, Friday PM, and Saturday endoscopy shifts
-- look non-generated in broad preparation paths.
UPDATE "ShiftTemplate"
SET "defaultForSchedule" = true
WHERE "active" = true
  AND (
    "notes" ILIKE '%Easton spreadsheet%'
    OR "notes" ILIKE '%Easton spreadsheet default:% source shift%'
    OR "name" ~ '^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) [0-9]{4}-[0-9]{4} \([0-9.]+\)$'
  );

UPDATE "ShiftBlock" AS block
SET "defaultForSchedule" = true
FROM "ShiftTemplate" AS template
WHERE block."shiftTemplateId" = template."id"
  AND block."active" = true
  AND template."defaultForSchedule" = true;
