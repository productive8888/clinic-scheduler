import { selectAssignment, toExistingAssignment } from "./assignment";
import { dateToWeekday } from "./constraints";
import { tryRepairRequiredAssignment } from "./repair";
import type {
  ExistingAssignment,
  GenerateScheduleInput,
  ScheduleAssignment,
  ScheduleConflict,
  ScheduleRepair,
  SchedulerTaskSlot,
  SchedulerTaskType,
} from "./types";

export const SCHEDULER_ENGINE_VERSION = "1.1.0";

export function generateSchedule(input: GenerateScheduleInput) {
  const taskTypesById = new Map(input.taskTypes.map((taskType) => [taskType.id, taskType]));
  const slotsById = new Map(input.slots.map((slot) => [slot.id, slot]));
  const assignments: ScheduleAssignment[] = [];
  const conflicts: ScheduleConflict[] = [];
  const repairs: ScheduleRepair[] = [];
  const occupiedAssignments: ExistingAssignment[] = [
    ...(input.existingAssignments ?? []),
  ];

  for (const slot of input.slots) {
    const taskType = taskTypesById.get(slot.taskTypeId);
    const lockedEmployeeIds = [
      ...(slot.lockedEmployeeIds ?? []),
      ...(slot.lockedEmployeeId ? [slot.lockedEmployeeId] : []),
    ];
    const reservedEmployeeIds = dedupeEmployeeIds(
      slot.reservedEmployeeIds ?? [],
      lockedEmployeeIds,
    );

    if (!taskType) {
      continue;
    }

    for (const lockedEmployeeId of lockedEmployeeIds) {
      const lockedAssignment: ScheduleAssignment = {
        slotId: slot.id,
        employeeId: lockedEmployeeId,
        taskTypeId: taskType.id,
        date: slot.date,
        source: "LOCKED",
        score: Number.POSITIVE_INFINITY,
      };

      assignments.push(lockedAssignment);
      occupiedAssignments.push(toExistingAssignment(lockedAssignment, slot, taskType));
    }

    for (const reservedEmployeeId of reservedEmployeeIds) {
      const reservedAssignment: ScheduleAssignment = {
        slotId: slot.id,
        employeeId: reservedEmployeeId,
        taskTypeId: taskType.id,
        date: slot.date,
        source: "GENERATED",
        score: Number.MAX_SAFE_INTEGER,
      };

      assignments.push(reservedAssignment);
      occupiedAssignments.push(
        toExistingAssignment(reservedAssignment, slot, taskType),
      );
    }
  }

  for (const slot of sortSlots(input.slots, taskTypesById)) {
    const taskType = taskTypesById.get(slot.taskTypeId);

    if (!taskType) {
      conflicts.push({
        slotId: slot.id,
        taskTypeId: slot.taskTypeId,
        date: slot.date,
        reason: "Task type not found",
        rejectedCandidates: [],
      });
      continue;
    }

    const lockedEmployeeIds = [
      ...(slot.lockedEmployeeIds ?? []),
      ...(slot.lockedEmployeeId ? [slot.lockedEmployeeId] : []),
    ];
    const reservedEmployeeIds = dedupeEmployeeIds(
      slot.reservedEmployeeIds ?? [],
      lockedEmployeeIds,
    );
    const prefilledEmployeeIds = [...lockedEmployeeIds, ...reservedEmployeeIds];

    const requiredStaff = Math.max(1, slot.requiredStaff ?? 1);
    const remainingStaffNeeded = Math.max(
      0,
      requiredStaff - prefilledEmployeeIds.length,
    );

    for (let staffIndex = 0; staffIndex < remainingStaffNeeded; staffIndex += 1) {
      const selection = selectAssignment({
        seed: `${input.seed}:${staffIndex}`,
        slot,
        taskType,
        employees: input.employees,
        rules: input.rules ?? [],
        fairness: input.fairness,
        assignments: occupiedAssignments,
      });

      if (!selection.assignment) {
        const repair = tryRepairRequiredAssignment({
          seed: `${input.seed}:${staffIndex}`,
          targetSlot: slot,
          targetTaskType: taskType,
          employees: input.employees,
          rules: input.rules ?? [],
          fairness: input.fairness,
          assignments,
          occupiedAssignments,
          slotsById,
          taskTypesById,
        });

        if (repair) {
          removeAssignment(
            assignments,
            occupiedAssignments,
            repair.displacedAssignment,
          );
          assignments.push(repair.targetAssignment);
          occupiedAssignments.push(
            toExistingAssignment(repair.targetAssignment, slot, taskType),
          );

          if (repair.replacementAssignment) {
            const displacedSlot = slotsById.get(repair.displacedAssignment.slotId);
            const displacedTaskType = taskTypesById.get(
              repair.displacedAssignment.taskTypeId,
            );

            if (displacedSlot && displacedTaskType) {
              assignments.push(repair.replacementAssignment);
              occupiedAssignments.push(
                toExistingAssignment(
                  repair.replacementAssignment,
                  displacedSlot,
                  displacedTaskType,
                ),
              );
            }
          }

          repairs.push(repair.repair);
          continue;
        }

        conflicts.push({
          slotId: slot.id,
          taskTypeId: taskType.id,
          date: slot.date,
          reason:
            staffIndex === 0
              ? "No compatible available employee"
              : `Only filled ${staffIndex + prefilledEmployeeIds.length} of ${requiredStaff} required staff`,
          rejectedCandidates: selection.rejectedCandidates,
        });
        break;
      }

      assignments.push(selection.assignment);
      occupiedAssignments.push(toExistingAssignment(selection.assignment, slot, taskType));
    }
  }

  return {
    assignments: sortAssignments(assignments),
    conflicts,
    repairs,
    diagnostics: {
      seed: input.seed,
      slotCount: input.slots.length,
      assignmentCount: assignments.length,
      conflictCount: conflicts.length,
      repairCount: repairs.length,
    },
  };
}

function sortSlots(
  slots: SchedulerTaskSlot[],
  taskTypesById: Map<string, SchedulerTaskType>,
) {
  return [...slots].sort((left, right) => {
    const leftTask = taskTypesById.get(left.taskTypeId);
    const rightTask = taskTypesById.get(right.taskTypeId);
    const leftSkillCount = leftTask?.requiredSkillIds.length ?? 0;
    const rightSkillCount = rightTask?.requiredSkillIds.length ?? 0;
    const leftDifficulty = leftTask?.difficultyWeight ?? 0;
    const rightDifficulty = rightTask?.difficultyWeight ?? 0;
    const leftSortOrder = leftTask?.sortOrder ?? 0;
    const rightSortOrder = rightTask?.sortOrder ?? 0;

    return (
      hardWorkPatternPriority(left) - hardWorkPatternPriority(right) ||
      requirementPriority(left) - requirementPriority(right) ||
      objectivePriority(leftTask) - objectivePriority(rightTask) ||
      rightSkillCount - leftSkillCount ||
      rightDifficulty - leftDifficulty ||
      left.date.localeCompare(right.date) ||
      leftSortOrder - rightSortOrder ||
      left.slotIndex - right.slotIndex ||
      left.id.localeCompare(right.id)
    );
  });
}

function hardWorkPatternPriority(slot: SchedulerTaskSlot) {
  if (
    dateToWeekday(slot.date) === 6 &&
    (slot.shiftCategory === "ENDO" || slot.shiftCategory === "SATURDAY")
  ) {
    return 0;
  }

  return 1;
}

function objectivePriority(taskType: SchedulerTaskType | undefined) {
  if (taskType?.isPatientFacing) {
    return 0;
  }

  if (taskType?.isClinical) {
    return 1;
  }

  if (taskType?.isFloat) {
    return 2;
  }

  if (taskType?.isBackground) {
    return 3;
  }

  return 2;
}

function requirementPriority(slot: SchedulerTaskSlot) {
  switch (slot.requirementLevel) {
    case "REQUIRED":
      return 0;
    case "DESIRED":
      return 1;
    case "CONDITIONAL":
      return 2;
    case "OPTIONAL":
      return 3;
    default:
      return 0;
  }
}

function dedupeEmployeeIds(employeeIds: string[], excludedEmployeeIds: string[] = []) {
  const excluded = new Set(excludedEmployeeIds);
  const seen = new Set<string>();

  return employeeIds.filter((employeeId) => {
    if (excluded.has(employeeId) || seen.has(employeeId)) {
      return false;
    }

    seen.add(employeeId);
    return true;
  });
}

function sortAssignments(assignments: ScheduleAssignment[]) {
  return [...assignments].sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.taskTypeId.localeCompare(right.taskTypeId) ||
      left.slotId.localeCompare(right.slotId),
  );
}

function removeAssignment(
  assignments: ScheduleAssignment[],
  occupiedAssignments: ExistingAssignment[],
  assignment: ScheduleAssignment,
) {
  const assignmentIndex = assignments.findIndex(
    (item) =>
      item.slotId === assignment.slotId && item.employeeId === assignment.employeeId,
  );
  if (assignmentIndex >= 0) {
    assignments.splice(assignmentIndex, 1);
  }

  const occupiedIndex = occupiedAssignments.findIndex(
    (item) =>
      item.slotId === assignment.slotId && item.employeeId === assignment.employeeId,
  );
  if (occupiedIndex >= 0) {
    occupiedAssignments.splice(occupiedIndex, 1);
  }
}
