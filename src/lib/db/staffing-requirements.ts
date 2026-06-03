import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import type { StaffingRequirementFormValues } from "@/lib/validation/staffing-requirement";
import { parseIsoDate } from "@/lib/utils/date";

export function getStaffingRequirementsPageData() {
  return Promise.all([
    getDb().staffingRequirementRule.findMany({
      orderBy: [
        { active: "desc" },
        { taskType: { sortOrder: "asc" } },
        { weekday: "asc" },
        { scenario: "asc" },
        { updatedAt: "desc" },
      ],
      include: {
        taskType: true,
        shiftTemplate: true,
        createdBy: true,
      },
    }),
    getDb().taskType.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        optional: true,
        isPatientFacing: true,
        isClinical: true,
        isBackground: true,
        isSkilled: true,
        isEndoscopy: true,
        isFloat: true,
        isClosureCandidate: true,
      },
    }),
    getDb().shiftTemplate.findMany({
      where: { active: true },
      orderBy: [
        { dayOfWeek: "asc" },
        { startMinute: "asc" },
        { name: "asc" },
      ],
      select: {
        id: true,
        name: true,
        dayOfWeek: true,
        startMinute: true,
        endMinute: true,
        shiftCategory: true,
        defaultForSchedule: true,
      },
    }),
  ]);
}

export async function updateTaskTypeClassification(input: {
  taskTypeId: string;
  values: {
    isPatientFacing: boolean;
    isClinical: boolean;
    isBackground: boolean;
    isSkilled: boolean;
    isEndoscopy: boolean;
    isFloat: boolean;
    isClosureCandidate: boolean;
  };
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.taskType.findUniqueOrThrow({
    where: { id: input.taskTypeId },
  });
  const taskType = await db.taskType.update({
    where: { id: input.taskTypeId },
    data: input.values,
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "task_type.classification_update",
    entityType: "TaskType",
    entityId: taskType.id,
    before,
    after: taskType,
  });

  return taskType;
}

export async function createStaffingRequirementRule(input: {
  values: StaffingRequirementFormValues;
  actorEmployeeId?: string | null;
}) {
  const rule = await getDb().staffingRequirementRule.create({
    data: toStaffingRuleData(input.values, input.actorEmployeeId),
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "staffing_requirement_rule.create",
    entityType: "StaffingRequirementRule",
    entityId: rule.id,
    after: rule,
  });

  return rule;
}

export async function updateStaffingRequirementRule(input: {
  ruleId: string;
  values: StaffingRequirementFormValues;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.staffingRequirementRule.findUniqueOrThrow({
    where: { id: input.ruleId },
  });
  const rule = await db.staffingRequirementRule.update({
    where: { id: input.ruleId },
    data: toStaffingRuleData(input.values, undefined),
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "staffing_requirement_rule.update",
    entityType: "StaffingRequirementRule",
    entityId: rule.id,
    before,
    after: rule,
  });

  return rule;
}

export async function deactivateStaffingRequirementRule(input: {
  ruleId: string;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.staffingRequirementRule.findUniqueOrThrow({
    where: { id: input.ruleId },
  });
  const rule = await db.staffingRequirementRule.update({
    where: { id: input.ruleId },
    data: { active: false },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "staffing_requirement_rule.deactivate",
    entityType: "StaffingRequirementRule",
    entityId: rule.id,
    before,
    after: rule,
  });

  return rule;
}

function toStaffingRuleData(
  values: StaffingRequirementFormValues,
  createdByEmployeeId: string | null | undefined,
) {
  return {
    taskTypeId: values.taskTypeId,
    shiftTemplateId: values.shiftTemplateId,
    shiftCategory: values.shiftCategory,
    weekday: values.weekday,
    scenario: values.scenario,
    minRequiredSlots: values.minRequiredSlots,
    desiredSlots: values.desiredSlots,
    maxSlots: values.maxSlots,
    requirementLevel: values.requirementLevel,
    active: values.active,
    effectiveStartDate: values.effectiveStartDate
      ? parseIsoDate(values.effectiveStartDate)
      : null,
    effectiveEndDate: values.effectiveEndDate
      ? parseIsoDate(values.effectiveEndDate)
      : null,
    notes: values.notes,
    ...(createdByEmployeeId === undefined
      ? {}
      : { createdByEmployeeId: createdByEmployeeId ?? null }),
  };
}
