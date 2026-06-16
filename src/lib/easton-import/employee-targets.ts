import {
  eastonWorkPatternGroups,
  type EastonWorkPatternGroup,
} from "@/lib/easton-import/work-patterns";
import type { SchedulerEmployee } from "@/lib/scheduler";

export type EastonEmployeeIdentity = {
  id: string;
  fullName: string;
};

export type EastonTargetIdentity = {
  employeeId?: string | null;
  employeeName: string;
  scheduleEligibility?: string | null;
};

export const LEGACY_EASTON_GENERIC_WORK_PATTERN_CODES = [
  "EASTON_ENDOSCOPY_SATURDAY",
  "EASTON_NON_ENDOSCOPY_SATURDAY",
] as const;

export function isLegacyEastonGenericWorkPatternCode(code?: string | null) {
  return Boolean(
    code && LEGACY_EASTON_GENERIC_WORK_PATTERN_CODES.includes(code as never),
  );
}

export function isExactEastonWorkPatternCode(code?: string | null) {
  return Boolean(
    code && eastonWorkPatternGroups().some((group) => group.code === code),
  );
}

export function findEastonTargetForEmployee<TTarget extends EastonTargetIdentity>(
  employee: EastonEmployeeIdentity,
  targets: TTarget[],
) {
  const activeTargets = activeScheduledTargets(targets);
  const byLinkedEmployee = activeTargets.find(
    (target) => target.employeeId === employee.id,
  );

  if (byLinkedEmployee) {
    return byLinkedEmployee;
  }

  const employeeFullName = normalizeEastonEmployeeName(employee.fullName);
  const exactNameMatches = activeTargets.filter(
    (target) => normalizeEastonEmployeeName(target.employeeName) === employeeFullName,
  );

  if (exactNameMatches.length === 1) {
    return exactNameMatches[0];
  }

  const employeeFirstName = firstEastonNameToken(employee.fullName);
  const firstNameMatches = activeTargets.filter(
    (target) =>
      normalizeEastonEmployeeName(target.employeeName) === employeeFirstName,
  );

  return firstNameMatches.length === 1 ? firstNameMatches[0] : null;
}

export function findEmployeeForEastonTarget<TEmployee extends EastonEmployeeIdentity>(
  target: EastonTargetIdentity,
  employees: TEmployee[],
) {
  if (
    target.scheduleEligibility &&
    target.scheduleEligibility !== "ACTIVE_SCHEDULED"
  ) {
    return null;
  }

  if (target.employeeId) {
    const linked = employees.find((employee) => employee.id === target.employeeId);

    if (linked) {
      return linked;
    }
  }

  const targetName = normalizeEastonEmployeeName(target.employeeName);
  const exactNameMatches = employees.filter(
    (employee) => normalizeEastonEmployeeName(employee.fullName) === targetName,
  );

  if (exactNameMatches.length === 1) {
    return exactNameMatches[0];
  }

  const firstNameMatches = employees.filter(
    (employee) => firstEastonNameToken(employee.fullName) === targetName,
  );

  return firstNameMatches.length === 1 ? firstNameMatches[0] : null;
}

function activeScheduledTargets<TTarget extends EastonTargetIdentity>(
  targets: TTarget[],
) {
  return targets.filter(
    (target) =>
      !target.scheduleEligibility ||
      target.scheduleEligibility === "ACTIVE_SCHEDULED",
  );
}

export function eastonWorkPatternGroupForCode(code?: string | null) {
  if (!code || !isExactEastonWorkPatternCode(code)) {
    return null;
  }

  return eastonWorkPatternGroups().find((group) => group.code === code) ?? null;
}

export function eastonGroupToSchedulerWorkPattern(
  group: EastonWorkPatternGroup,
): NonNullable<SchedulerEmployee["workPattern"]> & { code: string } {
  const isEndoscopySaturday = group.kind === "ENDOSCOPY_SATURDAY";

  return {
    code: group.code,
    kind: group.kind,
    worksTuesdayThroughSaturday: isEndoscopySaturday,
    saturdayPaidHours: group.saturdayPaidHours,
    requiredSaturdayShiftCategory: group.requiredSaturdayShiftCategory,
    extraHourWeekdays: [...group.extraHourWeekdays],
    mondayOffAllowed: isEndoscopySaturday,
    fridayOffAllowed: false,
    earlyStartDaysPerWeek: group.extraHourWeekdays.filter(
      (weekday) => weekday !== 1,
    ).length,
  };
}

export function normalizeEastonEmployeeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function firstEastonNameToken(value: string) {
  return normalizeEastonEmployeeName(value).split(" ")[0] ?? "";
}
