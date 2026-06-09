import {
  eastonGroupToSchedulerWorkPattern,
  eastonWorkPatternGroupForCode,
  isLegacyEastonGenericWorkPatternCode,
} from "@/lib/easton-import/employee-targets";
import type { SchedulerEmployee } from "@/lib/scheduler";

type WorkPatternKind = "CUSTOM" | "ENDOSCOPY_SATURDAY" | "NON_ENDOSCOPY_SATURDAY";
type ShiftCategory = "AM" | "PM" | "SATURDAY" | "ENDO" | "FLOAT" | "OTHER";

export type EmployeeWorkPatternSource = {
  code?: string | null;
  kind?: WorkPatternKind | null;
  targetWeeklyHours?: unknown;
  worksTuesdayThroughSaturday?: boolean | null;
  saturdayPaidHours?: unknown;
  requiredSaturdayShiftCategory?: ShiftCategory | string | null;
  extraHourWeekdays?: unknown;
  mondayOffAllowed?: boolean | null;
  fridayOffAllowed?: boolean | null;
  earlyStartDaysPerWeek?: number | null;
} | null;

export type EmployeeScheduleTargetSource = {
  workPatternCode?: string | null;
  extraHourWeekdays?: unknown;
  targetTotalHours?: unknown;
  requiredBackgroundAssignments?: number | null;
} | null;

export type EffectiveWorkPattern = NonNullable<SchedulerEmployee["workPattern"]> & {
  code?: string | null;
  targetWeeklyHours?: number | null;
};

export function getEffectiveWorkPattern(input: {
  employeeWorkPattern?: EmployeeWorkPatternSource;
  scheduleTarget?: EmployeeScheduleTargetSource;
  expectedWeeklyHours?: unknown;
}): EffectiveWorkPattern | null {
  const targetGroup = eastonWorkPatternGroupForCode(
    input.scheduleTarget?.workPatternCode,
  );

  if (targetGroup) {
    return {
      ...eastonGroupToSchedulerWorkPattern(targetGroup),
      targetWeeklyHours: numberOrNull(input.scheduleTarget?.targetTotalHours) ?? 40,
    };
  }

  const employeePattern = input.employeeWorkPattern;

  if (
    !employeePattern?.kind ||
    isLegacyEastonGenericWorkPatternCode(employeePattern.code)
  ) {
    return null;
  }

  return {
    code: employeePattern.code ?? null,
    kind: employeePattern.kind,
    worksTuesdayThroughSaturday:
      employeePattern.worksTuesdayThroughSaturday ?? false,
    saturdayPaidHours: numberOrNull(employeePattern.saturdayPaidHours),
    requiredSaturdayShiftCategory:
      normalizeShiftCategory(employeePattern.requiredSaturdayShiftCategory),
    extraHourWeekdays: jsonNumberArray(employeePattern.extraHourWeekdays),
    mondayOffAllowed: employeePattern.mondayOffAllowed ?? false,
    fridayOffAllowed: employeePattern.fridayOffAllowed ?? false,
    earlyStartDaysPerWeek: employeePattern.earlyStartDaysPerWeek ?? 0,
    targetWeeklyHours:
      numberOrNull(employeePattern.targetWeeklyHours) ??
      numberOrNull(input.expectedWeeklyHours),
  };
}

export function getEffectiveWeeklyTargetHours(input: {
  workPattern?: EffectiveWorkPattern | null;
  scheduleTarget?: EmployeeScheduleTargetSource;
  expectedWeeklyHours?: unknown;
}) {
  return (
    numberOrNull(input.workPattern?.targetWeeklyHours) ??
    numberOrNull(input.scheduleTarget?.targetTotalHours) ??
    numberOrNull(input.expectedWeeklyHours) ??
    40
  );
}

export function getEffectiveRequiredBackgroundAssignments(input: {
  employeeRequiredBackgroundAssignments?: number | null;
  scheduleTarget?: EmployeeScheduleTargetSource;
}) {
  return (
    input.scheduleTarget?.requiredBackgroundAssignments ??
    input.employeeRequiredBackgroundAssignments ??
    0
  );
}

function normalizeShiftCategory(value?: string | null) {
  const allowed = new Set(["AM", "PM", "SATURDAY", "ENDO", "FLOAT", "OTHER"]);

  return value && allowed.has(value) ? (value as ShiftCategory) : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function jsonNumberArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(Number).filter((item) => Number.isFinite(item));
}
