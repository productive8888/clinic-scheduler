import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import type { SchedulingRuleFormValues } from "@/lib/validation/scheduling-rule";
import { parseIsoDate } from "@/lib/utils/date";

export function getSchedulingRulesPageData() {
  return Promise.all([
    getDb().schedulingRule.findMany({
      orderBy: [{ active: "desc" }, { priority: "desc" }, { createdAt: "desc" }],
      include: {
        employee: true,
        taskType: true,
        createdBy: true,
      },
    }),
    getDb().employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        role: true,
      },
    }),
    getDb().taskType.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
      },
    }),
  ]);
}

export async function createSchedulingRule(input: {
  values: SchedulingRuleFormValues;
  actorEmployeeId?: string | null;
}) {
  const rule = await getDb().schedulingRule.create({
    data: toRuleData(input.values, input.actorEmployeeId),
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "scheduling_rule.create",
    entityType: "SchedulingRule",
    entityId: rule.id,
    after: rule,
  });

  return rule;
}

export async function updateSchedulingRule(input: {
  ruleId: string;
  values: SchedulingRuleFormValues;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.schedulingRule.findUniqueOrThrow({
    where: { id: input.ruleId },
  });
  const rule = await db.schedulingRule.update({
    where: { id: input.ruleId },
    data: toRuleData(input.values, undefined),
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "scheduling_rule.update",
    entityType: "SchedulingRule",
    entityId: rule.id,
    before,
    after: rule,
  });

  return rule;
}

export async function deactivateSchedulingRule(input: {
  ruleId: string;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.schedulingRule.findUniqueOrThrow({
    where: { id: input.ruleId },
  });
  const rule = await db.schedulingRule.update({
    where: { id: input.ruleId },
    data: { active: false },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "scheduling_rule.deactivate",
    entityType: "SchedulingRule",
    entityId: rule.id,
    before,
    after: rule,
  });

  return rule;
}

function toRuleData(
  values: SchedulingRuleFormValues,
  createdByEmployeeId: string | null | undefined,
) {
  return {
    type: values.type,
    employeeId: values.employeeId,
    taskTypeId: values.taskTypeId,
    weight: values.weight,
    priority: values.weight,
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
