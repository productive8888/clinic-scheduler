import type { ShiftCategory } from "@prisma/client";

export type ShiftTemplateSnapshotInput = {
  id: string;
  name: string;
  startMinute: number;
  endMinute: number;
  paidHours: number | { toString(): string };
  shiftCategory: ShiftCategory;
  defaultForSchedule: boolean;
  notes?: string | null;
};

export function buildShiftBlockSnapshot(template: ShiftTemplateSnapshotInput) {
  return {
    shiftTemplateId: template.id,
    name: template.name,
    startMinute: template.startMinute,
    endMinute: template.endMinute,
    paidHours: Number(template.paidHours),
    shiftCategory: template.shiftCategory,
    defaultForSchedule: template.defaultForSchedule,
    source: "TEMPLATE",
    active: true,
    notes: template.notes ?? null,
  };
}
