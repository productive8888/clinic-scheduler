-- Allergy Shots remains available for historical assignment records, but it is
-- not an active July Easton generation role. July demand comes from GI,
-- Allergy, and PCP rows in Shifts + Hours; Patients is validation-only.
UPDATE "TaskType"
SET
  "active" = false,
  "defaultForRoutine" = false,
  "defaultForReduced" = false,
  "optional" = true
WHERE "code" = 'ALLERGY_SHOTS';

UPDATE "StaffingRequirementRule"
SET
  "active" = false,
  "notes" = 'Archived by July Easton migration. Allergy Shots is not an active July generation role.'
WHERE "taskTypeId" IN (
  SELECT "id" FROM "TaskType" WHERE "code" = 'ALLERGY_SHOTS'
);