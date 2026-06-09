import { dateToWeekday } from "@/lib/scheduler/constraints";
import { eastonWorkPatternGroups, weekdayShortName } from "@/lib/easton-import/work-patterns";

export type WeeklyHardRequirementTarget = {
  employeeId: string | null;
  employeeName: string;
  workPatternCode: string | null;
  requiresWorkPattern?: boolean;
  requiredBackgroundAssignments: number;
  extraHourWeekdays: number[];
  expectedWeeklyHours: number;
};

export type WeeklyHardRequirementAssignment = {
  employeeId: string;
  date: string;
  shiftBlockId: string;
  shiftCategory: string;
  paidHours: number;
  taskTypeCode: string;
  isBackground: boolean;
};

export type WeeklyHardRequirementIssue = {
  code:
    | "UNMATCHED_TARGET_EMPLOYEE"
    | "WORK_PATTERN_MISSING"
    | "BG_MINIMUM_UNMET"
    | "BELOW_EXPECTED_HOURS"
    | "SATURDAY_PATTERN_UNMET"
    | "EXTRA_HOUR_DAY_UNMET";
  employeeId: string | null;
  employeeName: string;
  message: string;
};

export function evaluateWeeklyHardRequirements(input: {
  targets: WeeklyHardRequirementTarget[];
  assignments: WeeklyHardRequirementAssignment[];
}) {
  const patternsByCode = new Map(
    eastonWorkPatternGroups().map((pattern) => [pattern.code, pattern]),
  );
  const assignmentsByEmployeeId = new Map<
    string,
    WeeklyHardRequirementAssignment[]
  >();
  const issues: WeeklyHardRequirementIssue[] = [];

  for (const assignment of input.assignments) {
    const employeeAssignments =
      assignmentsByEmployeeId.get(assignment.employeeId) ?? [];
    employeeAssignments.push(assignment);
    assignmentsByEmployeeId.set(assignment.employeeId, employeeAssignments);
  }

  for (const target of input.targets) {
    if (!target.employeeId) {
      issues.push({
        code: "UNMATCHED_TARGET_EMPLOYEE",
        employeeId: null,
        employeeName: target.employeeName,
        message: `${target.employeeName} has an imported July target but is not linked to an active employee.`,
      });
      continue;
    }

    if (target.requiresWorkPattern && !target.workPatternCode) {
      issues.push({
        code: "WORK_PATTERN_MISSING",
        employeeId: target.employeeId,
        employeeName: target.employeeName,
        message: `${target.employeeName} has imported July role targets but no recognized work-pattern group.`,
      });
    }

    const employeeAssignments = assignmentsByEmployeeId.get(target.employeeId) ?? [];
    const backgroundAssignments = employeeAssignments.filter(
      (assignment) =>
        assignment.taskTypeCode === "BACKGROUND" || assignment.isBackground,
    ).length;
    const scheduledHours = uniqueScheduledHours(employeeAssignments);

    if (
      target.requiredBackgroundAssignments > 0 &&
      backgroundAssignments < target.requiredBackgroundAssignments
    ) {
      issues.push({
        code: "BG_MINIMUM_UNMET",
        employeeId: target.employeeId,
        employeeName: target.employeeName,
        message: `${target.employeeName} has ${backgroundAssignments}/${target.requiredBackgroundAssignments} required BG assignments.`,
      });
    }

    if (target.expectedWeeklyHours > 0 && scheduledHours < target.expectedWeeklyHours) {
      issues.push({
        code: "BELOW_EXPECTED_HOURS",
        employeeId: target.employeeId,
        employeeName: target.employeeName,
        message: `${target.employeeName} has ${formatHours(scheduledHours)}/${formatHours(target.expectedWeeklyHours)} expected weekly hours scheduled.`,
      });
    }

    const pattern = target.workPatternCode
      ? patternsByCode.get(target.workPatternCode)
      : null;

    if (!pattern) {
      continue;
    }

    const hasRequiredSaturday = employeeAssignments.some(
      (assignment) =>
        dateToWeekday(assignment.date) === 6 &&
        assignment.shiftCategory === pattern.requiredSaturdayShiftCategory &&
        assignment.paidHours === pattern.saturdayPaidHours,
    );

    if (!hasRequiredSaturday) {
      issues.push({
        code: "SATURDAY_PATTERN_UNMET",
        employeeId: target.employeeId,
        employeeName: target.employeeName,
        message: `${target.employeeName} is missing the required ${pattern.requiredSaturdayShiftCategory} Saturday ${pattern.saturdayPaidHours}-hour shift for ${pattern.label}.`,
      });
    }

    for (const weekday of target.extraHourWeekdays) {
      const hasExtraHourShift = employeeAssignments.some(
        (assignment) =>
          dateToWeekday(assignment.date) === weekday && assignment.paidHours >= 5,
      );

      if (!hasExtraHourShift) {
        issues.push({
          code: "EXTRA_HOUR_DAY_UNMET",
          employeeId: target.employeeId,
          employeeName: target.employeeName,
          message: `${target.employeeName} is missing a 5-hour make-up shift on ${weekdayShortName(weekday)}.`,
        });
      }
    }
  }

  return {
    issues,
    bgMinimumIssues: issues.filter((issue) => issue.code === "BG_MINIMUM_UNMET"),
    workPatternIssues: issues.filter(
      (issue) =>
        issue.code === "WORK_PATTERN_MISSING" ||
        issue.code === "SATURDAY_PATTERN_UNMET" ||
        issue.code === "EXTRA_HOUR_DAY_UNMET",
    ),
    unmatchedTargetIssues: issues.filter(
      (issue) => issue.code === "UNMATCHED_TARGET_EMPLOYEE",
    ),
    canPublish: issues.length === 0,
  };
}

function uniqueScheduledHours(assignments: WeeklyHardRequirementAssignment[]) {
  const shifts = new Map<string, number>();

  for (const assignment of assignments) {
    shifts.set(
      `${assignment.date}:${assignment.shiftBlockId}`,
      assignment.paidHours,
    );
  }

  return [...shifts.values()].reduce((total, hours) => total + hours, 0);
}

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
