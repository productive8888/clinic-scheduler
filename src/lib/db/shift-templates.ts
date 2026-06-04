import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { LEGACY_SHIFT_TEMPLATE_ID } from "@/lib/shifts/legacy";
import type { ShiftTemplateFormValues } from "@/lib/validation/shift-template";
import { parseIsoDate } from "@/lib/utils/date";
import { timeStringToMinute } from "@/lib/utils/time";

export function getShiftTemplatesPageData() {
  return getDb().shiftTemplate.findMany({
    where: { id: { not: LEGACY_SHIFT_TEMPLATE_ID } },
    orderBy: [
      { active: "desc" },
      { dayOfWeek: "asc" },
      { startMinute: "asc" },
      { name: "asc" },
    ],
    include: {
      createdBy: true,
      _count: {
        select: {
          shiftBlocks: true,
          staffingRules: true,
        },
      },
    },
  });
}

export async function createShiftTemplate(input: {
  values: ShiftTemplateFormValues;
  actorEmployeeId?: string | null;
}) {
  const template = await getDb().shiftTemplate.create({
    data: toShiftTemplateData(input.values, input.actorEmployeeId),
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "shift_template.create",
    entityType: "ShiftTemplate",
    entityId: template.id,
    after: template,
  });

  return template;
}

export async function updateShiftTemplate(input: {
  templateId: string;
  values: ShiftTemplateFormValues;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.shiftTemplate.findUniqueOrThrow({
    where: { id: input.templateId },
  });
  const template = await db.shiftTemplate.update({
    where: { id: input.templateId },
    data: toShiftTemplateData(input.values, undefined),
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "shift_template.update",
    entityType: "ShiftTemplate",
    entityId: template.id,
    before,
    after: template,
  });

  return template;
}

export async function deactivateShiftTemplate(input: {
  templateId: string;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.shiftTemplate.findUniqueOrThrow({
    where: { id: input.templateId },
  });
  const template = await db.shiftTemplate.update({
    where: { id: input.templateId },
    data: { active: false },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "shift_template.deactivate",
    entityType: "ShiftTemplate",
    entityId: template.id,
    before,
    after: template,
  });

  return template;
}

function toShiftTemplateData(
  values: ShiftTemplateFormValues,
  createdByEmployeeId: string | null | undefined,
) {
  const startMinute = timeStringToMinute(values.startTime);
  const endMinute = timeStringToMinute(values.endTime);

  if (startMinute === null || endMinute === null) {
    throw new Error("Shift start and end time are required.");
  }

  return {
    name: values.name,
    dayOfWeek: values.dayOfWeek,
    startMinute,
    endMinute,
    paidHours: values.paidHours,
    shiftCategory: values.shiftCategory,
    defaultForSchedule: values.defaultForSchedule,
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
