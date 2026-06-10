import type {
  AvailabilityWindow,
  SchedulerEmployee,
} from "@/lib/scheduler/types";

const MONDAY = 1;
const FRIDAY = 5;
const SATURDAY = 6;
const JULY_WEEKDAY_START = 7 * 60;
const JULY_WEEKDAY_END = 18 * 60;
const JULY_SATURDAY_START = 6 * 60;
const JULY_SATURDAY_END = 14 * 60;

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

  if (
    pattern.kind === "ENDOSCOPY_SATURDAY" ||
    pattern.kind === "NON_ENDOSCOPY_SATURDAY"
  ) {
    return julyClinicAvailabilityWindows();
  }

  return [];
}

function julyClinicAvailabilityWindows() {
  const windows: AvailabilityWindow[] = [];

  for (let weekday = MONDAY; weekday <= FRIDAY; weekday += 1) {
    windows.push(
      availabilityWindow(weekday, JULY_WEEKDAY_START, JULY_WEEKDAY_END),
    );
  }

  windows.push(
    availabilityWindow(SATURDAY, JULY_SATURDAY_START, JULY_SATURDAY_END),
  );

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
