import { dateToWeekday } from "@/lib/scheduler/constraints";

export type WorkPatternRequirement = {
  kind: "CUSTOM" | "ENDOSCOPY_SATURDAY" | "NON_ENDOSCOPY_SATURDAY";
  workPatternCode: string | null;
  targetWeeklyHours: number;
  requiredSaturdayShiftCategory: string | null;
  requiredSaturdayPaidHours: number | null;
  extraHourWeekdays: number[];
};

export type WorkPatternEmployeeInput = {
  workPattern?: {
    code?: string | null;
    kind?: "CUSTOM" | "ENDOSCOPY_SATURDAY" | "NON_ENDOSCOPY_SATURDAY" | null;
    targetWeeklyHours?: number | string | null;
    requiredSaturdayShiftCategory?: string | null;
    saturdayPaidHours?: number | string | null;
    extraHourWeekdays?: unknown;
  } | null;
  expectedWeeklyHours?: number | string | null;
};

export type WorkPatternAssignmentInput = {
  date: string;
  shiftBlockId: string;
  shiftCategory?: string | null;
  startMinute?: number | null;
  endMinute?: number | null;
  paidHours?: number | null;
};

export type WorkPatternValidation = {
  requirement: WorkPatternRequirement | null;
  totalHours: number;
  expectedHours: number;
  requiredExtraHourWeekdays: number[];
  satisfiedExtraHourWeekdays: number[];
  missingExtraHourWeekdays: number[];
  requiredSaturdayShiftCategory: string | null;
  requiredSaturdayPaidHours: number | null;
  saturdayAssignment: WorkPatternAssignmentInput | null;
  hasRequiredSaturday: boolean;
  belowExpectedHours: boolean;
};

const MONDAY_EARLY_START = 7 * 60;
const MONDAY_EARLY_END = 12 * 60;
const MONDAY_LATE_START = 13 * 60;
const MONDAY_LATE_END = 18 * 60;
const EXTRA_AM_START = 7 * 60;
const EXTRA_AM_END = 12 * 60;
const FIVE_HOURS = 5;

export function getEmployeeWeekPatternRequirement(
  employee: WorkPatternEmployeeInput,
): WorkPatternRequirement | null {
  const pattern = employee.workPattern;

  if (!pattern?.kind) {
    return null;
  }

  const targetWeeklyHours = Number(
    pattern.targetWeeklyHours ?? employee.expectedWeeklyHours ?? 40,
  );
  const extraHourWeekdays =
    pattern.kind === "NON_ENDOSCOPY_SATURDAY"
      ? jsonNumberArray(pattern.extraHourWeekdays)
      : [];

  return {
    kind: pattern.kind,
    workPatternCode: pattern.code ?? null,
    targetWeeklyHours: Number.isFinite(targetWeeklyHours)
      ? targetWeeklyHours
      : 40,
    requiredSaturdayShiftCategory:
      pattern.requiredSaturdayShiftCategory ?? null,
    requiredSaturdayPaidHours:
      pattern.saturdayPaidHours === null ||
      pattern.saturdayPaidHours === undefined
        ? null
        : Number(pattern.saturdayPaidHours),
    extraHourWeekdays,
  };
}

export function validateEmployeeWeekPattern(input: {
  employee: WorkPatternEmployeeInput;
  assignments: WorkPatternAssignmentInput[];
}) {
  const requirement = getEmployeeWeekPatternRequirement(input.employee);
  const totalHours = uniqueScheduledHours(input.assignments);
  const expectedHours = requirement?.targetWeeklyHours ?? Number(input.employee.expectedWeeklyHours ?? 0);

  if (!requirement) {
    return {
      requirement: null,
      totalHours,
      expectedHours,
      requiredExtraHourWeekdays: [],
      satisfiedExtraHourWeekdays: [],
      missingExtraHourWeekdays: [],
      requiredSaturdayShiftCategory: null,
      requiredSaturdayPaidHours: null,
      saturdayAssignment: null,
      hasRequiredSaturday: true,
      belowExpectedHours: expectedHours > 0 && totalHours < expectedHours,
    } satisfies WorkPatternValidation;
  }

  const satisfiedExtraHourWeekdays = getSatisfiedExtraHourWeekdays({
    requirement,
    assignments: input.assignments,
  });
  const missingExtraHourWeekdays = requirement.extraHourWeekdays.filter(
    (weekday) => !satisfiedExtraHourWeekdays.includes(weekday),
  );
  const saturdayAssignment = getSaturdayPatternAssignment({
    requirement,
    assignments: input.assignments,
  });
  const hasRequiredSaturday =
    !requirement.requiredSaturdayShiftCategory ||
    !requirement.requiredSaturdayPaidHours ||
    Boolean(saturdayAssignment);

  return {
    requirement,
    totalHours,
    expectedHours: requirement.targetWeeklyHours,
    requiredExtraHourWeekdays: requirement.extraHourWeekdays,
    satisfiedExtraHourWeekdays,
    missingExtraHourWeekdays,
    requiredSaturdayShiftCategory: requirement.requiredSaturdayShiftCategory,
    requiredSaturdayPaidHours: requirement.requiredSaturdayPaidHours,
    saturdayAssignment,
    hasRequiredSaturday,
    belowExpectedHours: totalHours < requirement.targetWeeklyHours,
  } satisfies WorkPatternValidation;
}

export function getSatisfiedExtraHourWeekdays(input: {
  requirement: WorkPatternRequirement;
  assignments: WorkPatternAssignmentInput[];
}) {
  return input.requirement.extraHourWeekdays
    .filter((weekday) =>
      input.assignments.some((assignment) =>
        isExtraHourShiftForWeekday(assignment, weekday),
      ),
    )
    .sort((left, right) => left - right);
}

export function isExtraHourShiftForWeekday(
  slot: Pick<
    WorkPatternAssignmentInput,
    "date" | "startMinute" | "endMinute" | "paidHours"
  >,
  weekday: number,
) {
  if (dateToWeekday(slot.date) !== weekday || Number(slot.paidHours) !== FIVE_HOURS) {
    return false;
  }

  if (weekday === 1) {
    return (
      (slot.startMinute === MONDAY_EARLY_START &&
        slot.endMinute === MONDAY_EARLY_END) ||
      (slot.startMinute === MONDAY_LATE_START &&
        slot.endMinute === MONDAY_LATE_END)
    );
  }

  if (weekday >= 2 && weekday <= 4) {
    return (
      slot.startMinute === EXTRA_AM_START && slot.endMinute === EXTRA_AM_END
    );
  }

  return false;
}

export function getSaturdayPatternAssignment(input: {
  requirement: WorkPatternRequirement;
  assignments: WorkPatternAssignmentInput[];
}) {
  if (
    !input.requirement.requiredSaturdayShiftCategory ||
    !input.requirement.requiredSaturdayPaidHours
  ) {
    return null;
  }

  return (
    input.assignments.find(
      (assignment) =>
        dateToWeekday(assignment.date) === 6 &&
        assignment.shiftCategory ===
          input.requirement.requiredSaturdayShiftCategory &&
        Number(assignment.paidHours) ===
          input.requirement.requiredSaturdayPaidHours,
    ) ?? null
  );
}

export function uniqueScheduledHours(assignments: WorkPatternAssignmentInput[]) {
  const shifts = new Map<string, number>();

  for (const assignment of assignments) {
    shifts.set(
      `${assignment.date}:${assignment.shiftBlockId}`,
      Number(assignment.paidHours ?? 0),
    );
  }

  return [...shifts.values()].reduce((total, hours) => total + hours, 0);
}

function jsonNumberArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(Number).filter((item) => Number.isFinite(item));
}
