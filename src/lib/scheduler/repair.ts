import { selectAssignment, toExistingAssignment } from "./assignment";
import { overlaps, slotEnd, slotStart } from "./constraints";
import type {
  ExistingAssignment,
  ScheduleAssignment,
  ScheduleRepair,
  SchedulerEmployee,
  SchedulerFairnessSettings,
  SchedulerRule,
  SchedulerTaskSlot,
  SchedulerTaskType,
} from "./types";

export type AssignmentRepairResult = {
  repair: ScheduleRepair;
  targetAssignment: ScheduleAssignment;
  displacedAssignment: ScheduleAssignment;
  replacementAssignment?: ScheduleAssignment;
};

export function tryRepairRequiredAssignment(input: {
  seed: string;
  targetSlot: SchedulerTaskSlot;
  targetTaskType: SchedulerTaskType;
  employees: SchedulerEmployee[];
  rules: SchedulerRule[];
  fairness?: SchedulerFairnessSettings;
  assignments: ScheduleAssignment[];
  occupiedAssignments: ExistingAssignment[];
  slotsById: Map<string, SchedulerTaskSlot>;
  taskTypesById: Map<string, SchedulerTaskType>;
}) {
  if (
    input.targetSlot.requirementLevel !== "REQUIRED" ||
    (!input.targetTaskType.isPatientFacing && !input.targetTaskType.isClinical)
  ) {
    return null;
  }

  const employeesById = new Map(
    input.employees.map((employee) => [employee.id, employee]),
  );
  const displacedCandidates = input.assignments
    .filter((assignment) => assignment.source !== "LOCKED")
    .map((assignment) => {
      const slot = input.slotsById.get(assignment.slotId);
      const taskType = input.taskTypesById.get(assignment.taskTypeId);

      return slot && taskType ? { assignment, slot, taskType } : null;
    })
    .filter(
      (
        candidate,
      ): candidate is {
        assignment: ScheduleAssignment;
        slot: SchedulerTaskSlot;
        taskType: SchedulerTaskType;
      } => Boolean(candidate),
    )
    .filter(
      (candidate) =>
        !(candidate.taskType.isBackground && candidate.slot.protectedFromPull) &&
        candidate.assignment.date === input.targetSlot.date &&
        overlaps(
          slotStart(candidate.slot),
          slotEnd(candidate.slot),
          slotStart(input.targetSlot),
          slotEnd(input.targetSlot),
        ),
    )
    .sort((left, right) => {
      return (
        pullPriority(left.taskType, left.slot) -
          pullPriority(right.taskType, right.slot) ||
        left.assignment.slotId.localeCompare(right.assignment.slotId) ||
        left.assignment.employeeId.localeCompare(right.assignment.employeeId)
      );
    });

  for (const displaced of displacedCandidates) {
    const employee = employeesById.get(displaced.assignment.employeeId);

    if (!employee) {
      continue;
    }

    const occupiedWithoutDisplaced = input.occupiedAssignments.filter(
      (assignment) =>
        !(
          assignment.slotId === displaced.assignment.slotId &&
          assignment.employeeId === displaced.assignment.employeeId
        ),
    );
    const targetSelection = selectAssignment({
      seed: `${input.seed}:repair-target:${displaced.assignment.slotId}`,
      slot: input.targetSlot,
      taskType: input.targetTaskType,
      employees: [employee],
      rules: input.rules,
      fairness: input.fairness,
      assignments: occupiedWithoutDisplaced,
    });

    if (!targetSelection.assignment) {
      continue;
    }

    const occupiedWithTarget = [
      ...occupiedWithoutDisplaced,
      toExistingAssignment(
        targetSelection.assignment,
        input.targetSlot,
        input.targetTaskType,
      ),
    ];
    const replacementSelection = selectAssignment({
      seed: `${input.seed}:repair-replacement:${displaced.assignment.slotId}`,
      slot: displaced.slot,
      taskType: displaced.taskType,
      employees: input.employees,
      rules: input.rules,
      fairness: input.fairness,
      assignments: occupiedWithTarget,
    });

    if (replacementSelection.assignment) {
      return {
        targetAssignment: targetSelection.assignment,
        displacedAssignment: displaced.assignment,
        replacementAssignment: replacementSelection.assignment,
        repair: {
          targetSlotId: input.targetSlot.id,
          displacedSlotId: displaced.slot.id,
          strategy: "SWAP",
          employeeId: displaced.assignment.employeeId,
          replacementEmployeeId: replacementSelection.assignment.employeeId,
        },
      } satisfies AssignmentRepairResult;
    }

    const pullStrategy = pullStrategyFor(displaced.taskType, displaced.slot);

    if (pullStrategy) {
      return {
        targetAssignment: targetSelection.assignment,
        displacedAssignment: displaced.assignment,
        repair: {
          targetSlotId: input.targetSlot.id,
          displacedSlotId: displaced.slot.id,
          strategy: pullStrategy,
          employeeId: displaced.assignment.employeeId,
          replacementEmployeeId: null,
        },
      } satisfies AssignmentRepairResult;
    }
  }

  return null;
}

function pullStrategyFor(
  taskType: SchedulerTaskType,
  slot: SchedulerTaskSlot,
): ScheduleRepair["strategy"] | null {
  if (taskType.isFloat) {
    return "PULL_FLOAT";
  }

  if (
    taskType.isBackground &&
    slot.canBePulledForClinic &&
    !slot.protectedFromPull
  ) {
    return "PULL_BACKGROUND";
  }

  return null;
}

function pullPriority(taskType: SchedulerTaskType, slot: SchedulerTaskSlot) {
  if (
    taskType.isBackground &&
    slot.canBePulledForClinic &&
    !slot.protectedFromPull
  ) {
    return 0;
  }

  if (taskType.isFloat) {
    return 1;
  }

  return 2;
}
