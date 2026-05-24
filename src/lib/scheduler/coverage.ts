import { selectAssignment } from "./assignment";
import type {
  ExistingAssignment,
  ScheduleConflict,
  SchedulerEmployee,
  SchedulerRule,
  SchedulerTaskSlot,
  SchedulerTaskType,
} from "./types";

export type CoverageResolutionInput = {
  seed: string;
  unavailableEmployeeId: string;
  slot: SchedulerTaskSlot;
  taskType: SchedulerTaskType;
  employees: SchedulerEmployee[];
  rules?: SchedulerRule[];
  existingAssignments?: ExistingAssignment[];
};

export function resolveDirectReplacement(input: CoverageResolutionInput) {
  const assignmentsWithoutUnavailable = (input.existingAssignments ?? []).filter(
    (assignment) =>
      assignment.employeeId !== input.unavailableEmployeeId ||
      assignment.slotId !== input.slot.id,
  );

  const availableEmployees = input.employees.filter(
    (employee) => employee.id !== input.unavailableEmployeeId,
  );

  const selection = selectAssignment({
    seed: `${input.seed}:coverage:${input.slot.id}`,
    slot: input.slot,
    taskType: input.taskType,
    employees: availableEmployees,
    rules: input.rules ?? [],
    assignments: assignmentsWithoutUnavailable,
  });

  if (selection.assignment) {
    return {
      assignment: {
        ...selection.assignment,
        source: "COVERAGE_REPLACEMENT" as const,
      },
      conflict: null,
    };
  }

  const conflict: ScheduleConflict = {
    slotId: input.slot.id,
    taskTypeId: input.taskType.id,
    date: input.slot.date,
    reason: "No direct replacement found for unavailable employee",
    rejectedCandidates: selection.rejectedCandidates,
  };

  return {
    assignment: null,
    conflict,
  };
}
