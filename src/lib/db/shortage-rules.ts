import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import type { ShortageRuleFormValues } from "@/lib/validation/shortage-rule";
import { parseIsoDate } from "@/lib/utils/date";

export function getShortageRulesPageData() {
  return Promise.all([
    getDb().shortageRule.findMany({
      orderBy: [
        { active: "desc" },
        { closurePriority: "asc" },
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
      select: { id: true, name: true, code: true },
    }),
    getDb().shiftTemplate.findMany({
      where: { active: true },
      orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        dayOfWeek: true,
        startMinute: true,
        endMinute: true,
        shiftCategory: true,
      },
    }),
  ]);
}

export async function createShortageRule(input: {
  values: ShortageRuleFormValues;
  actorEmployeeId?: string | null;
}) {
  const rule = await getDb().shortageRule.create({
    data: toShortageRuleData(input.values, input.actorEmployeeId),
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "shortage_rule.create",
    entityType: "ShortageRule",
    entityId: rule.id,
    after: rule,
  });

  return rule;
}

export async function updateShortageRule(input: {
  ruleId: string;
  values: ShortageRuleFormValues;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.shortageRule.findUniqueOrThrow({
    where: { id: input.ruleId },
  });
  const rule = await db.shortageRule.update({
    where: { id: input.ruleId },
    data: toShortageRuleData(input.values, undefined),
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "shortage_rule.update",
    entityType: "ShortageRule",
    entityId: rule.id,
    before,
    after: rule,
  });

  return rule;
}

export async function deactivateShortageRule(input: {
  ruleId: string;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.shortageRule.findUniqueOrThrow({
    where: { id: input.ruleId },
  });
  const rule = await db.shortageRule.update({
    where: { id: input.ruleId },
    data: { active: false },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "shortage_rule.deactivate",
    entityType: "ShortageRule",
    entityId: rule.id,
    before,
    after: rule,
  });

  return rule;
}

function toShortageRuleData(
  values: ShortageRuleFormValues,
  createdByEmployeeId: string | null | undefined,
) {
  return {
    taskTypeId: values.taskTypeId,
    shiftTemplateId: values.shiftTemplateId,
    shiftCategory: values.shiftCategory,
    scenario: values.scenario,
    closurePriority: values.closurePriority,
    managerInstruction: values.managerInstruction,
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
