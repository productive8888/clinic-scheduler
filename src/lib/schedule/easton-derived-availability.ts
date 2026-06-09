import type {
  AvailabilityWindow,
  SchedulerEmployee,
} from "@/lib/scheduler/types";

const MONDAY = 1;
const SATURDAY = 6;
const AM_EARLY_START = 7 * 60;
const AM_EARLY_END = 12 * 60;
const MONDAY_LONG_PM_START = 13 * 60;
const MONDAY_LONG_PM_END = 18 * 60;
const SATURDAY_ENDO_START = 6 * 60;
const SATURDAY_REGULAR_START = 8 * 60;
const SATURDAY_END = 14 * 60;

export function withEastonDerivedAvailability<T extends SchedulerEmployee>(
  employee: T,
): T {
  const derived = eastonDerivedAvailabilityWindows(employee);

  if (derived.length === 0) {
    return employee;
  }

  return {
    ...employee,
    availability: mergeAvailability(employee.availability, derived),
  };
}

export function eastonDerivedAvailabilityWindows(
  employee: Pick<SchedulerEmployee, "workPattern">,
): AvailabilityWindow[] {
  const pattern = employee.workPattern;

  if (!pattern?.kind) {
    return [];
  }

  if (pattern.kind === "ENDOSCOPY_SATURDAY") {
    return [
      availabilityWindow(SATURDAY, SATURDAY_ENDO_START, SATURDAY_END),
    ];
  }

  if (pattern.kind !== "NON_ENDOSCOPY_SATURDAY") {
    return [];
  }

  const windows = [
    availabilityWindow(SATURDAY, SATURDAY_REGULAR_START, SATURDAY_END),
  ];

  for (const weekday of pattern.extraHourWeekdays ?? []) {
    if (weekday === MONDAY) {
      windows.push(
        availabilityWindow(MONDAY, AM_EARLY_START, AM_EARLY_END),
        availabilityWindow(MONDAY, MONDAY_LONG_PM_START, MONDAY_LONG_PM_END),
      );
      continue;
    }

    if (weekday >= 2 && weekday <= 4) {
      windows.push(availabilityWindow(weekday, AM_EARLY_START, AM_EARLY_END));
    }
  }

  return windows;
}

function availabilityWindow(
  weekday: number,
  startMinute: number,
  endMinute: number,
): AvailabilityWindow {
  return {
    weekday,
    startMinute,
    endMinute,
    active: true,
  };
}

function mergeAvailability(
  existing: AvailabilityWindow[],
  derived: AvailabilityWindow[],
) {
  const byKey = new Map<string, AvailabilityWindow>();

  for (const window of [...existing, ...derived]) {
    byKey.set(
      `${window.weekday}:${window.startMinute}:${window.endMinute}:${window.effectiveStartDate ?? ""}:${window.effectiveEndDate ?? ""}`,
      window,
    );
  }

  return [...byKey.values()].sort(
    (left, right) =>
      left.weekday - right.weekday ||
      left.startMinute - right.startMinute ||
      left.endMinute - right.endMinute,
  );
}
