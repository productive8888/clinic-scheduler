import {
  getConstraintRejections,
  overlaps,
} from "@/lib/scheduler/constraints";
import type {
  ExistingAssignment,
  SchedulerEmployee,
  SchedulerTaskSlot,
  SchedulerTaskType,
} from "@/lib/scheduler/types";
import { clinicWeekRange } from "@/lib/schedule/range";

export type ManualAssignmentWarning = {
  code:
    | "MISSING_SKILL"
    | "NOT_ELIGIBLE"
    | "PTO_NPTO"
    | "OUTSIDE_AVAILABILITY"
    | "OVERLAPPING_SHIFT"
    | "WEEKLY_ASSIGNMENT_LIMIT"
    | "ABOVE_EXPECTED_HOURS"
    | "FAIRNESS_IMBALANCE"
    | "REQUIRED_SLOT_UNFILLED";
  message: string;
};

export function validateManualAssignment(input: {
  employee?: SchedulerEmployee | null;
  taskType: SchedulerTaskType;
  slot: SchedulerTaskSlot;
  assignments: ExistingAssignment[];
  expectedWeeklyHours?: number | null;
  clearingRequiredSlot?: boolean;
}) {
  if (!input.employee) {
    return input.clearingRequiredSlot
      ? [
          {
            code: "REQUIRED_SLOT_UNFILLED",
            message: "This leaves a required clinic slot unfilled.",
          } satisfies ManualAssignmentWarning,
        ]
      : [];
  }

  const warnings: ManualAssignmentWarning[] = [];
  const reasons = getConstraintRejections(
    input.employee,
    input.taskType,
    input.slot,
    input.assignments,
  );

  for (const reason of reasons) {
    if (
      reason === "Would double-book employee" &&
      !hasOverlappingAssignment({
        employeeId: input.employee.id,
        slot: input.slot,
        assignments: input.assignments,
      })
    ) {
      continue;
    }

    const warning = warningForConstraintReason(reason);
    if (warning) {
      warnings.push(warning);
    }
  }

  const expectedWeeklyHours = input.expectedWeeklyHours ?? null;

  if (expectedWeeklyHours !== null && expectedWeeklyHours > 0) {
    const week = clinicWeekRange(input.slot.date);
    const weeklyHours = input.assignments
      .filter(
        (assignment) =>
          assignment.employeeId === input.employee?.id &&
          assignment.date >= week.startDate &&
          assignment.date <= week.endDate,
      )
      .reduce((total, assignment) => total + (assignment.paidHours ?? 0), 0);
    const projectedHours = weeklyHours + (input.slot.paidHours ?? 0);

    if (projectedHours > expectedWeeklyHours) {
      warnings.push({
        code: "ABOVE_EXPECTED_HOURS",
        message: `This would raise the employee to ${projectedHours} scheduled hours, above their ${expectedWeeklyHours}-hour weekly target.`,
      });
    }
  }

  const assignmentCounts = new Map<string, number>();
  for (const assignment of input.assignments) {
    assignmentCounts.set(
      assignment.employeeId,
      (assignmentCounts.get(assignment.employeeId) ?? 0) + 1,
    );
  }
  const candidateAssignmentCount = assignmentCounts.get(input.employee.id) ?? 0;
  const averageAssignmentCount = assignmentCounts.size
    ? [...assignmentCounts.values()].reduce((sum, count) => sum + count, 0) /
      assignmentCounts.size
    : 0;

  if (candidateAssignmentCount >= averageAssignmentCount + 2) {
    warnings.push({
      code: "FAIRNESS_IMBALANCE",
      message:
        "This employee already has materially more assignments than the current weekly average.",
    });
  }

  return dedupeWarnings(warnings);
}

function warningForConstraintReason(reason: string): ManualAssignmentWarning | null {
  switch (reason) {
    case "Missing required skill":
      return {
        code: "MISSING_SKILL",
        message: "Employee is missing a required skill for this task.",
      };
    case "Outside weekly availability":
      return {
        code: "OUTSIDE_AVAILABILITY",
        message: "Assignment falls outside the employee's recurring availability.",
      };
    case "Not eligible for background task":
      return {
        code: "NOT_ELIGIBLE",
        message: "Employee is not configured as eligible for this background task.",
      };
    case "PTO or approved unavailability":
      return {
        code: "PTO_NPTO",
        message: "Employee has approved PTO, NPTO, or unavailability during this shift.",
      };
    case "Would double-book employee":
      return {
        code: "OVERLAPPING_SHIFT",
        message: "Assignment overlaps another active shift for this employee.",
      };
    case "Weekly assignment limit reached":
      return {
        code: "WEEKLY_ASSIGNMENT_LIMIT",
        message: "Employee has reached their weekly assignment limit.",
      };
    default:
      return null;
  }
}

function dedupeWarnings(warnings: ManualAssignmentWarning[]) {
  return [...new Map(warnings.map((warning) => [warning.code, warning])).values()];
}

export function hasOverlappingAssignment(input: {
  employeeId: string;
  slot: SchedulerTaskSlot;
  assignments: ExistingAssignment[];
}) {
  return input.assignments.some(
    (assignment) =>
      assignment.employeeId === input.employeeId &&
      assignment.date === input.slot.date &&
      overlaps(
        input.slot.startMinute ?? 0,
        input.slot.endMinute ?? 24 * 60,
        assignment.startMinute ?? 0,
        assignment.endMinute ?? 24 * 60,
      ),
  );
}
