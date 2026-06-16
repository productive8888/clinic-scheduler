-- Front Desk and Front Background are separate task types, but they share one
-- employee skill: FRONT. Merge any legacy Front BG skill rows into FRONT.

INSERT INTO "Skill" ("id", "code", "name", "description", "active", "createdAt", "updatedAt")
SELECT
  CONCAT('skill_front_', SUBSTRING(MD5(CLOCK_TIMESTAMP()::text) FROM 1 FOR 16)),
  'FRONT',
  'Front',
  'Required for Front Desk and Front Background assignments.',
  true,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "Skill" WHERE "code" = 'FRONT'
);

UPDATE "Skill"
SET
  "name" = 'Front',
  "description" = 'Required for Front Desk and Front Background assignments.',
  "active" = true,
  "updatedAt" = NOW()
WHERE "code" = 'FRONT';

WITH front_skill AS (
  SELECT "id" FROM "Skill" WHERE "code" = 'FRONT' LIMIT 1
),
legacy_skills AS (
  SELECT "id"
  FROM "Skill"
  WHERE "code" IN ('FRONT_BG', 'FRONT_BACKGROUND')
     OR LOWER("name") IN ('front bg', 'front background')
),
legacy_employee_skills AS (
  SELECT DISTINCT es."employeeId", fs."id" AS "frontSkillId"
  FROM "EmployeeSkill" es
  CROSS JOIN front_skill fs
  WHERE es."skillId" IN (SELECT "id" FROM legacy_skills)
)
INSERT INTO "EmployeeSkill" ("employeeId", "skillId", "assignedAt")
SELECT "employeeId", "frontSkillId", NOW()
FROM legacy_employee_skills
ON CONFLICT ("employeeId", "skillId") DO NOTHING;

WITH front_skill AS (
  SELECT "id" FROM "Skill" WHERE "code" = 'FRONT' LIMIT 1
),
legacy_skills AS (
  SELECT "id"
  FROM "Skill"
  WHERE "code" IN ('FRONT_BG', 'FRONT_BACKGROUND')
     OR LOWER("name") IN ('front bg', 'front background')
),
legacy_task_requirements AS (
  SELECT DISTINCT tsr."taskTypeId", fs."id" AS "frontSkillId"
  FROM "TaskSkillRequirement" tsr
  CROSS JOIN front_skill fs
  WHERE tsr."skillId" IN (SELECT "id" FROM legacy_skills)
)
INSERT INTO "TaskSkillRequirement" ("id", "taskTypeId", "skillId", "required")
SELECT
  CONCAT('tsk_front_', SUBSTRING(MD5(RANDOM()::text || CLOCK_TIMESTAMP()::text) FROM 1 FOR 16)),
  "taskTypeId",
  "frontSkillId",
  true
FROM legacy_task_requirements
ON CONFLICT ("taskTypeId", "skillId") DO UPDATE SET "required" = true;

WITH front_skill AS (
  SELECT "id" FROM "Skill" WHERE "code" = 'FRONT' LIMIT 1
),
front_task_types AS (
  SELECT "id" AS "taskTypeId"
  FROM "TaskType"
  WHERE "code" IN ('FRONT_DESK', 'FRONT_BACKGROUND', 'FRONT_BG', 'FRONT')
)
INSERT INTO "TaskSkillRequirement" ("id", "taskTypeId", "skillId", "required")
SELECT
  CONCAT('tsk_front_', SUBSTRING(MD5(RANDOM()::text || CLOCK_TIMESTAMP()::text) FROM 1 FOR 16)),
  ftt."taskTypeId",
  fs."id",
  true
FROM front_task_types ftt
CROSS JOIN front_skill fs
ON CONFLICT ("taskTypeId", "skillId") DO UPDATE SET "required" = true;

WITH front_skill AS (
  SELECT "id" FROM "Skill" WHERE "code" = 'FRONT' LIMIT 1
),
legacy_skills AS (
  SELECT "id"
  FROM "Skill"
  WHERE "code" IN ('FRONT_BG', 'FRONT_BACKGROUND')
     OR LOWER("name") IN ('front bg', 'front background')
),
legacy_background_requirements AS (
  SELECT DISTINCT brs."definitionId", fs."id" AS "frontSkillId"
  FROM "BackgroundTaskRequiredSkill" brs
  CROSS JOIN front_skill fs
  WHERE brs."skillId" IN (SELECT "id" FROM legacy_skills)
)
INSERT INTO "BackgroundTaskRequiredSkill" ("definitionId", "skillId")
SELECT "definitionId", "frontSkillId"
FROM legacy_background_requirements
ON CONFLICT ("definitionId", "skillId") DO NOTHING;

WITH legacy_skills AS (
  SELECT "id"
  FROM "Skill"
  WHERE "code" IN ('FRONT_BG', 'FRONT_BACKGROUND')
     OR LOWER("name") IN ('front bg', 'front background')
)
DELETE FROM "TaskSkillRequirement"
WHERE "skillId" IN (SELECT "id" FROM legacy_skills);

WITH legacy_skills AS (
  SELECT "id"
  FROM "Skill"
  WHERE "code" IN ('FRONT_BG', 'FRONT_BACKGROUND')
     OR LOWER("name") IN ('front bg', 'front background')
)
DELETE FROM "BackgroundTaskRequiredSkill"
WHERE "skillId" IN (SELECT "id" FROM legacy_skills);

WITH legacy_skills AS (
  SELECT "id"
  FROM "Skill"
  WHERE "code" IN ('FRONT_BG', 'FRONT_BACKGROUND')
     OR LOWER("name") IN ('front bg', 'front background')
)
DELETE FROM "EmployeeSkill"
WHERE "skillId" IN (SELECT "id" FROM legacy_skills);

DELETE FROM "Skill"
WHERE "code" IN ('FRONT_BG', 'FRONT_BACKGROUND')
   OR LOWER("name") IN ('front bg', 'front background');
