import { dateToWeekday } from "./constraints";
import { isExtraHourShiftForWeekday } from "@/lib/schedule/work-pattern-requirements";
import { isCanonicalBgTaskType } from "@/lib/schedule/bg-role";
import { isJulyPatientShiftTaskType } from "@/lib/schedule/patient-shifts";
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
  const nextPatientFacing = isJulyPatientShiftTaskType(taskType) ? 1 : 0;
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
  score += getWeeklyHoursTargetScore({
    employee,
    assignments,
    slot,
    settings,
  });
  score += getWorkPatternScore({
    employee,
    assignments,
    slot,
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
  const isLiteralBgTask = isCanonicalBgTaskType(input.taskType);
  const requiredBackgroundTarget =
    isLiteralBgTask
      ? input.employee.requiredBackgroundAssignments
      : null;
  const effectiveTarget =
    requiredBackgroundTarget !== null && requiredBackgroundTarget !== undefined
      ? requiredBackgroundTarget
      : target;

  if (
    effectiveTarget === null ||
    effectiveTarget === undefined ||
    effectiveTarget <= 0
  ) {
    return 0;
  }

  const count = isLiteralBgTask
    ? (input.employee.scheduledBackgroundAssignmentsThisWeek ?? 0) +
      getCurrentTaskCount(input.employee.id, input.taskType.id, input.assignments)
    : getTaskAssignmentCount(input.employee, input.taskType.id) +
      getCurrentTaskCount(input.employee.id, input.taskType.id, input.assignments);

  if (count < effectiveTarget) {
    const multiplier = isLiteralBgTask ? 4 : 1;

    return (
      (effectiveTarget - count) *
      input.settings.skillRoleBalanceWeight *
      multiplier
    );
  }

  return -(count - effectiveTarget + 1) * input.settings.skillRoleBalanceWeight;
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

export function getWeeklyHoursTargetScore(input: {
  employee: SchedulerEmployee;
  assignments: ExistingAssignment[];
  slot?: SchedulerTaskSlot;
  settings: SchedulerFairnessSettings;
}) {
  const target = input.employee.targetWeeklyHours;

  if (!target || target <= 0 || !input.slot) {
    return 0;
  }

  const scheduledHours =
    (input.employee.scheduledHoursThisWeek ?? 0) +
    getCurrentScheduledHours(input.employee.id, input.assignments);
  const nextHours = input.slot.paidHours ?? 0;
  const remainingHours = target - scheduledHours;
  const projectedOverage = Math.max(0, scheduledHours + nextHours - target);

  if (remainingHours <= 0) {
    return -(Math.abs(remainingHours) + nextHours) * input.settings.totalHoursWeight;
  }

  return (
    remainingHours * input.settings.totalHoursWeight -
    projectedOverage * input.settings.totalHoursWeight * 2
  );
}

export function getWorkPatternScore(input: {
  employee: SchedulerEmployee;
  assignments: ExistingAssignment[];
  slot?: SchedulerTaskSlot;
  settings: SchedulerFairnessSettings;
}) {
  const pattern = input.employee.workPattern;

  if (!pattern || !input.slot) {
    return 0;
  }

  const weekday = dateToWeekday(input.slot.date);
  const weight = input.settings.patternConsistencyWeight;
  let score = 0;

  if (pattern.worksTuesdayThroughSaturday) {
    score += weekday >= 2 && weekday <= 6 ? weight : -weight;
  }

  if (weekday === 6 && pattern.saturdayPaidHours) {
    score +=
      input.slot.paidHours === pattern.saturdayPaidHours ? weight : -weight;
  }

  if (weekday === 6 && pattern.requiredSaturdayShiftCategory) {
    score +=
      input.slot.shiftCategory === pattern.requiredSaturdayShiftCategory
        ? weight * 2
        : -weight * 2;
  }

  const extraHourWeekdays = pattern.extraHourWeekdays ?? [];

  if (extraHourWeekdays.length > 0) {
    const isExtraHourDay = extraHourWeekdays.includes(weekday);
    const isRequiredExtraHourShift = isExtraHourShiftForWeekday(
      input.slot,
      weekday,
    );
    const isFiveHourShift = (input.slot.paidHours ?? 0) >= 5;

    if (isExtraHourDay) {
      score += isRequiredExtraHourShift ? weight * 2 : -weight * 2;
    } else if (
      pattern.kind === "NON_ENDOSCOPY_SATURDAY" &&
      isFiveHourShift &&
      weekday >= 1 &&
      weekday <= 5
    ) {
      score -= weight;
    }
  }

  const targetEarlyStarts = pattern.earlyStartDaysPerWeek ?? 0;

  if (targetEarlyStarts > 0 && (input.slot.startMinute ?? 24 * 60) <= 7 * 60) {
    const currentEarlyStarts =
      (input.employee.scheduledEarlyStartShiftsThisWeek ?? 0) +
      input.assignments.filter(
        (assignment) =>
          assignment.employeeId === input.employee.id &&
          (assignment.startMinute ?? 24 * 60) <= 7 * 60,
      ).length;

    score += currentEarlyStarts < targetEarlyStarts ? weight : -weight;
  }

  return score;
}
