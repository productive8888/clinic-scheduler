import { eastonWorkPatternGroups, weekdayShortName } from "@/lib/easton-import/work-patterns";
import {
  isExtraHourShiftForWeekday,
  uniqueScheduledHours,
  validateEmployeeWeekPattern,
  type WorkPatternValidation,
} from "@/lib/schedule/work-pattern-requirements";

export type WeeklyHardRequirementTarget = {
  employeeId: string | null;
  employeeName: string;
  activeTargetSheetName?: string | null;
  scheduleEligibility?: string | null;
  scheduleEligibilityReason?: string | null;
  workPatternCode: string | null;
  requiresWorkPattern?: boolean;
  workPatternKind?: "CUSTOM" | "ENDOSCOPY_SATURDAY" | "NON_ENDOSCOPY_SATURDAY" | null;
  requiredSaturdayShiftCategory?: string | null;
  saturdayPaidHours?: number | null;
  requiredBackgroundAssignments: number;
  extraHourWeekdays: number[];
  expectedWeeklyHours: number;
  targetTaskCounts?: Record<string, number>;
};

export type WeeklyHardRequirementAssignment = {
  employeeId: string;
  date: string;
  shiftBlockId: string;
  shiftCategory: string;
  startMinute: number;
  endMinute: number;
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
    | "ABOVE_EXPECTED_HOURS"
    | "SATURDAY_PATTERN_UNMET"
    | "EXTRA_HOUR_DAY_UNMET"
    | "FORBIDDEN_WORK_PATTERN_SHIFT";
  employeeId: string | null;
  employeeName: string;
  message: string;
};

export type WeeklyHardRequirementEmployeeDiagnostic = {
  employeeId: string;
  employeeName: string;
  workPattern: WorkPatternValidation;
  requiredBackgroundAssignments: number;
  assignedBackgroundAssignments: number;
  missingBackgroundAssignments: number;
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
  const employeeDiagnostics: WeeklyHardRequirementEmployeeDiagnostic[] = [];

  for (const assignment of input.assignments) {
    const employeeAssignments =
      assignmentsByEmployeeId.get(assignment.employeeId) ?? [];
    employeeAssignments.push(assignment);
    assignmentsByEmployeeId.set(assignment.employeeId, employeeAssignments);
  }

  for (const target of input.targets) {
    if (
      target.scheduleEligibility &&
      target.scheduleEligibility !== "ACTIVE_SCHEDULED"
    ) {
      continue;
    }

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
    const pattern = target.workPatternCode
      ? patternsByCode.get(target.workPatternCode)
      : null;
    const workPatternValidation = validateEmployeeWeekPattern({
      employee: {
        expectedWeeklyHours: target.expectedWeeklyHours,
        workPattern:
          pattern || target.workPatternKind
            ? {
                code: target.workPatternCode,
                kind: target.workPatternKind ?? pattern?.kind ?? null,
                targetWeeklyHours: target.expectedWeeklyHours,
                requiredSaturdayShiftCategory:
                  target.requiredSaturdayShiftCategory ??
                  pattern?.requiredSaturdayShiftCategory ??
                  null,
                saturdayPaidHours:
                  target.saturdayPaidHours ?? pattern?.saturdayPaidHours ?? null,
                extraHourWeekdays:
                  target.extraHourWeekdays.length > 0
                    ? target.extraHourWeekdays
                    : pattern?.extraHourWeekdays ?? [],
              }
            : null,
      },
      assignments: employeeAssignments,
    });

    employeeDiagnostics.push({
      employeeId: target.employeeId,
      employeeName: target.employeeName,
      workPattern: workPatternValidation,
      requiredBackgroundAssignments: target.requiredBackgroundAssignments,
      assignedBackgroundAssignments: backgroundAssignments,
      missingBackgroundAssignments: Math.max(
        0,
        target.requiredBackgroundAssignments - backgroundAssignments,
      ),
    });

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

    if (target.expectedWeeklyHours > 0 && scheduledHours > target.expectedWeeklyHours) {
      issues.push({
        code: "ABOVE_EXPECTED_HOURS",
        employeeId: target.employeeId,
        employeeName: target.employeeName,
        message: `${target.employeeName} has ${formatHours(scheduledHours)}/${formatHours(target.expectedWeeklyHours)} expected weekly hours scheduled and is above target.`,
      });
    }

    if (!workPatternValidation.requirement) {
      continue;
    }

    for (const assignment of employeeAssignments) {
      const forbiddenReason = forbiddenPatternAssignmentReason({
        assignment,
        workPattern: workPatternValidation,
      });

      if (forbiddenReason) {
        issues.push({
          code: "FORBIDDEN_WORK_PATTERN_SHIFT",
          employeeId: target.employeeId,
          employeeName: target.employeeName,
          message: `${target.employeeName} is assigned outside their July work pattern: ${forbiddenReason}.`,
        });
      }
    }

    if (!workPatternValidation.hasRequiredSaturday) {
      issues.push({
        code: "SATURDAY_PATTERN_UNMET",
        employeeId: target.employeeId,
        employeeName: target.employeeName,
        message: `${target.employeeName} is missing the required ${workPatternValidation.requiredSaturdayShiftCategory} Saturday ${workPatternValidation.requiredSaturdayPaidHours}-hour shift${pattern ? ` for ${pattern.label}` : ""}.`,
      });
    }

    for (const weekday of workPatternValidation.missingExtraHourWeekdays) {
      const patternLabel = pattern?.label ?? target.workPatternCode ?? "work pattern";

      issues.push({
        code: "EXTRA_HOUR_DAY_UNMET",
        employeeId: target.employeeId,
        employeeName: target.employeeName,
        message:
          weekday === 1
            ? `${target.employeeName} is in ${patternLabel} but missing Monday 0700-1200 or 1300-1800.`
            : `${target.employeeName} is in ${patternLabel} but missing ${weekdayFullName(weekday)} 0700-1200.`,
      });
    }
  }

  return {
    issues,
    employeeDiagnostics,
    bgMinimumIssues: issues.filter((issue) => issue.code === "BG_MINIMUM_UNMET"),
    workPatternIssues: issues.filter(
      (issue) =>
        issue.code === "WORK_PATTERN_MISSING" ||
        issue.code === "SATURDAY_PATTERN_UNMET" ||
        issue.code === "EXTRA_HOUR_DAY_UNMET" ||
        issue.code === "FORBIDDEN_WORK_PATTERN_SHIFT",
    ),
    unmatchedTargetIssues: issues.filter(
      (issue) => issue.code === "UNMATCHED_TARGET_EMPLOYEE",
    ),
    canPublish: issues.length === 0,
  };
}

function forbiddenPatternAssignmentReason(input: {
  assignment: WeeklyHardRequirementAssignment;
  workPattern: WorkPatternValidation;
}) {
  const requirement = input.workPattern.requirement;

  if (!requirement) {
    return null;
  }

  const weekday = new Date(`${input.assignment.date}T00:00:00.000Z`).getUTCDay();

  if (
    requirement.kind === "ENDOSCOPY_SATURDAY" &&
    weekday >= 1 &&
    weekday <= 5 &&
    isExtraHourShiftForWeekday(input.assignment, weekday)
  ) {
    return `${weekdayFullName(weekday)} ${formatMinute(input.assignment.startMinute)}-${formatMinute(input.assignment.endMinute)} is a weekday extra-hour shift for an Endoscopy/Saturday employee`;
  }

  if (
    weekday === 6 &&
    requirement.requiredSaturdayShiftCategory &&
    input.assignment.shiftCategory !== requirement.requiredSaturdayShiftCategory
  ) {
    return `Saturday ${input.assignment.shiftCategory} does not match required ${requirement.requiredSaturdayShiftCategory}`;
  }

  return null;
}

function formatMinute(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  return `${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`;
}

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function weekdayFullName(weekday: number) {
  return [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][weekday] ?? weekdayShortName(weekday);
}
