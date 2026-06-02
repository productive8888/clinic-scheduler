import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import type {
  BackgroundTaskCategoryFormValues,
  BackgroundTaskDefinitionFormValues,
} from "@/lib/validation/background-task";

export function getBackgroundTasksPageData() {
  return Promise.all([
    getDb().backgroundTaskCategory.findMany({
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: {
        definitions: {
          orderBy: [{ active: "desc" }, { priority: "asc" }, { name: "asc" }],
          include: {
            primaryOwner: true,
            eligibleEmployees: { include: { employee: true } },
            requiredSkills: { include: { skill: true } },
            _count: { select: { instances: true } },
          },
        },
      },
    }),
    getDb().employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    getDb().skill.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
  ]);
}

export async function createBackgroundTaskCategory(input: {
  values: BackgroundTaskCategoryFormValues;
  actorEmployeeId?: string | null;
}) {
  const category = await getDb().backgroundTaskCategory.upsert({
    where: { code: input.values.code },
    update: {
      name: input.values.name,
      description: input.values.description,
      sortOrder: input.values.sortOrder,
      active: input.values.active,
    },
    create: input.values,
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "background_task_category.upsert",
    entityType: "BackgroundTaskCategory",
    entityId: category.id,
    after: category,
  });

  return category;
}

export async function createBackgroundTaskDefinition(input: {
  values: BackgroundTaskDefinitionFormValues;
  actorEmployeeId?: string | null;
}) {
  const definition = await getDb().backgroundTaskDefinition.create({
    data: definitionCreateData(input.values, input.actorEmployeeId),
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "background_task_definition.create",
    entityType: "BackgroundTaskDefinition",
    entityId: definition.id,
    after: definition,
  });

  return definition;
}

export async function updateBackgroundTaskDefinition(input: {
  definitionId: string;
  values: BackgroundTaskDefinitionFormValues;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.backgroundTaskDefinition.findUniqueOrThrow({
    where: { id: input.definitionId },
    include: {
      eligibleEmployees: true,
      requiredSkills: true,
    },
  });
  const definition = await db.backgroundTaskDefinition.update({
    where: { id: input.definitionId },
    data: definitionUpdateData(input.values),
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "background_task_definition.update",
    entityType: "BackgroundTaskDefinition",
    entityId: definition.id,
    before,
    after: definition,
  });

  return definition;
}

export async function deactivateBackgroundTaskDefinition(input: {
  definitionId: string;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.backgroundTaskDefinition.findUniqueOrThrow({
    where: { id: input.definitionId },
  });
  const definition = await db.backgroundTaskDefinition.update({
    where: { id: input.definitionId },
    data: { active: false },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "background_task_definition.deactivate",
    entityType: "BackgroundTaskDefinition",
    entityId: definition.id,
    before,
    after: definition,
  });

  return definition;
}

function definitionCreateData(
  values: BackgroundTaskDefinitionFormValues,
  createdByEmployeeId: string | null | undefined,
) {
  return {
    categoryId: values.categoryId,
    name: values.name,
    description: values.description,
    estimatedHoursPerPeriod: values.estimatedHoursPerPeriod,
    periodType: values.periodType,
    customPeriodDays: values.customPeriodDays,
    priority: values.priority,
    mentor: values.mentor,
    primaryOwnerEmployeeId: values.primaryOwnerEmployeeId,
    canBePulledForClinic: values.canBePulledForClinic,
    rolloverAllowed: values.rolloverAllowed,
    active: values.active,
    notes: values.notes,
    createdByEmployeeId: createdByEmployeeId ?? null,
    eligibleEmployees: {
      create: values.eligibleEmployeeIds.map((employeeId) => ({ employeeId })),
    },
    requiredSkills: {
      create: values.requiredSkillIds.map((skillId) => ({ skillId })),
    },
  };
}

function definitionUpdateData(values: BackgroundTaskDefinitionFormValues) {
  return {
    categoryId: values.categoryId,
    name: values.name,
    description: values.description,
    estimatedHoursPerPeriod: values.estimatedHoursPerPeriod,
    periodType: values.periodType,
    customPeriodDays: values.customPeriodDays,
    priority: values.priority,
    mentor: values.mentor,
    primaryOwnerEmployeeId: values.primaryOwnerEmployeeId,
    canBePulledForClinic: values.canBePulledForClinic,
    rolloverAllowed: values.rolloverAllowed,
    active: values.active,
    notes: values.notes,
    eligibleEmployees: {
      deleteMany: {},
      create: values.eligibleEmployeeIds.map((employeeId) => ({ employeeId })),
    },
    requiredSkills: {
      deleteMany: {},
      create: values.requiredSkillIds.map((skillId) => ({ skillId })),
    },
  };
}
