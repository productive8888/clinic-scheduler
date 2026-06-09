UPDATE "Employee"
SET "workPatternId" = NULL
WHERE "workPatternId" IN (
  SELECT "id"
  FROM "WorkPattern"
  WHERE "code" IN (
    'EASTON_ENDOSCOPY_SATURDAY',
    'EASTON_NON_ENDOSCOPY_SATURDAY'
  )
);

UPDATE "WorkPattern"
SET
  "active" = false,
  "notes" = 'Archived by July scheduling migration. Use exact July work-pattern groups from Shifts by GY.'
WHERE "code" IN (
  'EASTON_ENDOSCOPY_SATURDAY',
  'EASTON_NON_ENDOSCOPY_SATURDAY'
);
