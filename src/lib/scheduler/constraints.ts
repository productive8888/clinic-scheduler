import type {
  ExistingAssignment,
  SchedulerEmployee,
  SchedulerTaskSlot,
  SchedulerTaskType,
} from "./types";

const FULL_DAY_START = 0;
const FULL_DAY_END = 24 * 60;

export function slotStart(slot: Pick<SchedulerTaskSlot, "startMinute">) {
  return slot.startMinute ?? FULL_DAY_START;
}

export function slotEnd(slot: Pick<SchedulerTaskSlot, "endMinute">) {
  return slot.endMinute ?? FULL_DAY_END;
}

export function dateToWeekday(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

export function isDateWithinRange(
  date: string,
  startDate?: string | null,
  endDate?: string | null,
) {
  if (startDate && date < startDate) {
    return false;
  }

  if (endDate && date > endDate) {
    return false;
  }

  return true;
}

export function overlaps(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function hasRequiredSkills(
  employee: SchedulerEmployee,
  taskType: SchedulerTaskType,
) {
  return taskType.requiredSkillIds.every((skillId) =>
    employee.skillIds.includes(skillId),
  );
}

export function isAvailableForSlot(
  employee: SchedulerEmployee,
  slot: SchedulerTaskSlot,
) {
  const weekday = dateToWeekday(slot.date);
  const start = slotStart(slot);
  const end = slotEnd(slot);

  return employee.availability.some((window) => {
    if (window.active === false) {
      return false;
    }

    if (window.weekday !== weekday) {
      return false;
    }

    if (!isDateWithinRange(slot.date, window.effectiveStartDate, window.effectiveEndDate)) {
      return false;
    }

    return window.startMinute <= start && window.endMinute >= end;
  });
}

export function isUnavailableForSlot(
  employee: SchedulerEmployee,
  slot: SchedulerTaskSlot,
) {
  const start = slotStart(slot);
  const end = slotEnd(slot);

  return (employee.unavailable ?? []).some((window) => {
    if (window.active === false) {
      return false;
    }

    if (!isDateWithinRange(slot.date, window.startDate, window.endDate)) {
      return false;
    }

    return overlaps(
      start,
      end,
      window.startMinute ?? FULL_DAY_START,
      window.endMinute ?? FULL_DAY_END,
    );
  });
}

export function wouldDoubleBook(
  employeeId: string,
  slot: SchedulerTaskSlot,
  assignments: ExistingAssignment[],
) {
  const start = slotStart(slot);
  const end = slotEnd(slot);

  return assignments.some((assignment) => {
    if (assignment.employeeId !== employeeId || assignment.date !== slot.date) {
      return false;
    }

    return overlaps(
      start,
      end,
      assignment.startMinute ?? FULL_DAY_START,
      assignment.endMinute ?? FULL_DAY_END,
    );
  });
}

export function isWithinWeeklyAssignmentLimit(
  employee: SchedulerEmployee,
  date: string,
  assignments: ExistingAssignment[],
) {
  if (!employee.weeklyAssignmentLimit) {
    return true;
  }

  const weekKey = getWeekKey(date);
  const weeklyAssignments = assignments.filter(
    (assignment) =>
      assignment.employeeId === employee.id && getWeekKey(assignment.date) === weekKey,
  );

  return weeklyAssignments.length < employee.weeklyAssignmentLimit;
}

export function getConstraintRejections(
  employee: SchedulerEmployee,
  taskType: SchedulerTaskType,
  slot: SchedulerTaskSlot,
  assignments: ExistingAssignment[],
) {
  const reasons: string[] = [];

  if (employee.active === false) {
    reasons.push("Employee is inactive");
  }

  if (!hasRequiredSkills(employee, taskType)) {
    reasons.push("Missing required skill");
  }

  if (!isAvailableForSlot(employee, slot)) {
    reasons.push("Outside weekly availability");
  }

  if (isUnavailableForSlot(employee, slot)) {
    reasons.push("PTO or approved unavailability");
  }

  if (wouldDoubleBook(employee.id, slot, assignments)) {
    reasons.push("Would double-book employee");
  }

  if (!isWithinWeeklyAssignmentLimit(employee, slot.date, assignments)) {
    reasons.push("Weekly assignment limit reached");
  }

  return reasons;
}

function getWeekKey(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const day = parsed.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  parsed.setUTCDate(parsed.getUTCDate() + mondayOffset);

  return parsed.toISOString().slice(0, 10);
}
