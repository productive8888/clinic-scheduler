import type { ClinicScenario } from "@prisma/client";
import { toIsoDate } from "@/lib/utils/date";

export type CalendarAssignmentEvent = {
  id: string;
  assignmentId: string;
  employeeId: string;
  employeeName: string;
  employeeEmail?: string | null;
  taskTypeName: string;
  taskTypeCode: string;
  slotLabel?: string | null;
  date: string;
  startMinute?: number | null;
  endMinute?: number | null;
  scenario: ClinicScenario | string;
  slotNotes?: string | null;
  assignmentSource?: string | null;
  locked?: boolean;
  updatedAt?: Date | string | null;
};

export type CalendarExportScheduleDay = {
  date: Date | string;
  status: string;
  scenario: ClinicScenario | string;
  taskSlots: CalendarExportTaskSlot[];
};

export type CalendarExportTaskSlot = {
  id: string;
  label?: string | null;
  status?: string | null;
  startMinute?: number | null;
  endMinute?: number | null;
  notes?: string | null;
  taskType: {
    name: string;
    code: string;
  };
  assignments: CalendarExportAssignment[];
};

export type CalendarExportAssignment = {
  id: string;
  employeeId: string;
  source?: string | null;
  locked?: boolean | null;
  updatedAt?: Date | string | null;
  employee: {
    fullName: string;
    email?: string | null;
  };
};

export function buildAssignmentCalendarEvents(input: {
  scheduleDays: CalendarExportScheduleDay[];
  employeeId?: string | null;
}) {
  const events: CalendarAssignmentEvent[] = [];

  for (const day of input.scheduleDays) {
    if (day.status !== "PUBLISHED") {
      continue;
    }

    const date = toIsoDate(day.date);

    for (const slot of day.taskSlots) {
      if (slot.status === "CANCELLED") {
        continue;
      }

      for (const assignment of slot.assignments) {
        if (input.employeeId && assignment.employeeId !== input.employeeId) {
          continue;
        }

        events.push({
          id: `${assignment.id}-${slot.id}`,
          assignmentId: assignment.id,
          employeeId: assignment.employeeId,
          employeeName: assignment.employee.fullName,
          employeeEmail: assignment.employee.email,
          taskTypeName: slot.taskType.name,
          taskTypeCode: slot.taskType.code,
          slotLabel: slot.label,
          date,
          startMinute: slot.startMinute,
          endMinute: slot.endMinute,
          scenario: day.scenario,
          slotNotes: slot.notes,
          assignmentSource: assignment.source,
          locked: Boolean(assignment.locked),
          updatedAt: assignment.updatedAt,
        });
      }
    }
  }

  return events.sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      (left.startMinute ?? 0) - (right.startMinute ?? 0) ||
      left.taskTypeName.localeCompare(right.taskTypeName) ||
      left.employeeName.localeCompare(right.employeeName) ||
      left.assignmentId.localeCompare(right.assignmentId),
  );
}
