import { dateToWeekday } from "./constraints";
import type {
  ExistingAssignment,
  SchedulerEmployee,
  SchedulerFairnessSettings,
  SchedulerTaskSlot,
  SchedulerTaskType,
} from "./types";

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
  taskType?: SchedulerTaskType,
  slot?: SchedulerTaskSlot,
  settings: SchedulerFairnessSettings = defaultFairnessSettings,
) {
  const historical = employee.historicalAssignments ?? 0;
  const current = getCurrentAssignmentCount(employee.id, assignments);
  const historicalClinical = employee.historicalClinicalAssignments ?? 0;
  const currentClinical = getCurrentClinicalCount(employee.id, assignments);
  const historicalPatientFacing =
    employee.historicalPatientFacingAssignments ?? 0;
  const currentPatientFacing = getCurrentPatientFacingCount(
    employee.id,
    assignments,
  );
  const historicalHours = employee.historicalScheduledHours ?? 0;
  const currentHours = getCurrentScheduledHours(employee.id, assignments);
  const historicalSaturday = employee.historicalSaturdayAssignments ?? 0;
  const currentSaturday = getCurrentSaturdayCount(employee.id, assignments);
  const historicalEndoscopy = employee.historicalEndoscopyAssignments ?? 0;
  const currentEndoscopy = getCurrentEndoscopyCount(employee.id, assignments);

  const nextClinical = taskType?.isClinical ? 1 : 0;
  const nextPatientFacing = taskType?.isPatientFacing ? 1 : 0;
  const nextHours = slot?.paidHours ?? 0;
  const nextSaturday =
    slot?.shiftCategory === "SATURDAY" || (slot ? dateToWeekday(slot.date) === 6 : false)
      ? 1
      : 0;
  const nextEndoscopy =
    taskType?.isEndoscopy || slot?.shiftCategory === "ENDO" ? 1 : 0;

  let score = -(
    (historical + current) * settings.totalShiftWeight +
    (historicalClinical + currentClinical + nextClinical) *
      settings.clinicalShiftWeight +
    (historicalPatientFacing + currentPatientFacing + nextPatientFacing) *
      settings.patientFacingShiftWeight +
    (historicalHours + currentHours + nextHours) * settings.totalHoursWeight +
    (historicalSaturday + currentSaturday + nextSaturday) *
      settings.saturdayShiftWeight +
    (historicalEndoscopy + currentEndoscopy + nextEndoscopy) *
      settings.endoscopyShiftWeight
  );

  score += getTargetTaskScore({
    employee,
    assignments,
    taskType,
    settings,
  });

  score += getExposureGoalScore({
    employee,
    assignments,
    taskType,
    settings,
  });

  if (taskType?.isBackground) {
    score -= settings.backgroundPenaltyWeight;
  }

  return score;
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

const defaultFairnessSettings: SchedulerFairnessSettings = {
  clinicalShiftWeight: 20,
  patientFacingShiftWeight: 20,
  totalShiftWeight: 10,
  totalHoursWeight: 8,
  saturdayShiftWeight: 12,
  endoscopyShiftWeight: 12,
  patternConsistencyWeight: 35,
  skillRoleBalanceWeight: 15,
  exposureGoalWeight: 12,
  backgroundPenaltyWeight: 20,
};

function getCurrentClinicalCount(
  employeeId: string,
  assignments: ExistingAssignment[],
) {
  return assignments.filter(
    (assignment) => assignment.employeeId === employeeId && assignment.isClinical,
  ).length;
}

function getCurrentPatientFacingCount(
  employeeId: string,
  assignments: ExistingAssignment[],
) {
  return assignments.filter(
    (assignment) =>
      assignment.employeeId === employeeId && assignment.isPatientFacing,
  ).length;
}

function getCurrentScheduledHours(
  employeeId: string,
  assignments: ExistingAssignment[],
) {
  return assignments
    .filter((assignment) => assignment.employeeId === employeeId)
    .reduce((total, assignment) => total + (assignment.paidHours ?? 0), 0);
}

function getCurrentTaskCount(
  employeeId: string,
  taskTypeId: string,
  assignments: ExistingAssignment[],
) {
  return assignments.filter(
    (assignment) =>
      assignment.employeeId === employeeId && assignment.taskTypeId === taskTypeId,
  ).length;
}

function getTargetTaskScore(input: {
  employee: SchedulerEmployee;
  assignments: ExistingAssignment[];
  taskType?: SchedulerTaskType;
  settings: SchedulerFairnessSettings;
}) {
  if (!input.taskType) {
    return 0;
  }

  const target = input.employee.targetTaskAssignments?.[input.taskType.id];

  if (target === null || target === undefined || target <= 0) {
    return 0;
  }

  const count =
    getTaskAssignmentCount(input.employee, input.taskType.id) +
    getCurrentTaskCount(input.employee.id, input.taskType.id, input.assignments);

  if (count < target) {
    return (target - count) * input.settings.skillRoleBalanceWeight;
  }

  return -(count - target + 1) * input.settings.skillRoleBalanceWeight;
}

function getExposureGoalScore(input: {
  employee: SchedulerEmployee;
  assignments: ExistingAssignment[];
  taskType?: SchedulerTaskType;
  settings: SchedulerFairnessSettings;
}) {
  if (!input.taskType || !input.employee.exposureGoals?.length) {
    return 0;
  }

  const exposureGroup = input.taskType.exposureGroup;

  if (!exposureGroup || !input.employee.exposureGoals.includes(exposureGroup)) {
    return 0;
  }

  const alreadyHasExposure =
    getTaskAssignmentCount(input.employee, input.taskType.id) > 0 ||
    input.assignments.some(
      (assignment) =>
        assignment.employeeId === input.employee.id &&
        assignment.taskTypeId === input.taskType?.id,
    );

  return alreadyHasExposure ? 0 : input.settings.exposureGoalWeight;
}

function getCurrentSaturdayCount(
  employeeId: string,
  assignments: ExistingAssignment[],
) {
  return assignments.filter(
    (assignment) =>
      assignment.employeeId === employeeId &&
      (assignment.shiftCategory === "SATURDAY" || dateToWeekday(assignment.date) === 6),
  ).length;
}

function getCurrentEndoscopyCount(
  employeeId: string,
  assignments: ExistingAssignment[],
) {
  return assignments.filter(
    (assignment) =>
      assignment.employeeId === employeeId &&
      (assignment.isEndoscopy || assignment.shiftCategory === "ENDO"),
  ).length;
}
