import type { ExistingAssignment, SchedulerEmployee } from "./types";

export function getCurrentAssignmentCount(
  employeeId: string,
  assignments: ExistingAssignment[],
) {
  return assignments.filter((assignment) => assignment.employeeId === employeeId).length;
}

export function getTaskAssignmentCount(
  employee: SchedulerEmployee,
  taskTypeId: string,
) {
  return employee.historicalTaskAssignments?.[taskTypeId] ?? 0;
}

export function getFairnessScore(
  employee: SchedulerEmployee,
  assignments: ExistingAssignment[],
) {
  const historical = employee.historicalAssignments ?? 0;
  const current = getCurrentAssignmentCount(employee.id, assignments);

  return -(historical * 4 + current * 12);
}

export function getDifficultTaskFatigueScore(
  employee: SchedulerEmployee,
  taskTypeId: string,
  difficultyWeight: number,
) {
  if (difficultyWeight <= 0) {
    return 0;
  }

  return -(getTaskAssignmentCount(employee, taskTypeId) * difficultyWeight * 5);
}
