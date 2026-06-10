-- July Easton workbooks use PCP as its own patient-facing role.
-- Keep legacy FOLLOWUP rows intact, but create PCP and retarget Easton-imported
-- PCP staffing rules away from FOLLOWUP.

INSERT INTO "TaskType" (
    "id",
    "code",
    "name",
    "description",
    "interchangeableGroup",
    "difficultyWeight",
    "active",
    "optional",
    "defaultForRoutine",
    "defaultForReduced",
    "isPatientFacing",
    "isClinical",
    "isBackground",
    "isSkilled",
    "isEndoscopy",
    "isFloat",
    "isClosureCandidate",
    "sortOrder",
    "createdAt",
    "updatedAt"
)
VALUES (
    'task_pcp',
    'PCP',
    'PCP',
    'Patient-facing PCP shift from the July Easton scheduling model.',
    NULL,
    0,
    true,
    false,
    false,
    false,
    true,
    true,
    false,
    false,
    false,
    false,
    false,
    55,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE SET
    "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "optional" = EXCLUDED."optional",
    "defaultForRoutine" = EXCLUDED."defaultForRoutine",
    "defaultForReduced" = EXCLUDED."defaultForReduced",
    "isPatientFacing" = EXCLUDED."isPatientFacing",
    "isClinical" = EXCLUDED."isClinical",
    "isBackground" = EXCLUDED."isBackground",
    "isSkilled" = EXCLUDED."isSkilled",
    "isEndoscopy" = EXCLUDED."isEndoscopy",
    "isFloat" = EXCLUDED."isFloat",
    "isClosureCandidate" = EXCLUDED."isClosureCandidate",
    "sortOrder" = EXCLUDED."sortOrder",
    "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "StaffingRequirementRule"
SET
    "taskTypeId" = (SELECT "id" FROM "TaskType" WHERE "code" = 'PCP'),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE
    "notes" LIKE 'Easton spreadsheet default:%PCP%'
    AND "taskTypeId" = (SELECT "id" FROM "TaskType" WHERE "code" = 'FOLLOWUP');

