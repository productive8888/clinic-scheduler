import { selectAssignment, toExistingAssignment } from "./assignment";
import type {
  ExistingAssignment,
  GenerateScheduleInput,
  ScheduleAssignment,
  ScheduleConflict,
  SchedulerTaskSlot,
  SchedulerTaskType,
} from "./types";

export const SCHEDULER_ENGINE_VERSION = "1.0.0";

export function generateSchedule(input: GenerateScheduleInput) {
  const taskTypesById = new Map(input.taskTypes.map((taskType) => [taskType.id, taskType]));
  const assignments: ScheduleAssignment[] = [];
  const conflicts: ScheduleConflict[] = [];
  const occupiedAssignments: ExistingAssignment[] = [
    ...(input.existingAssignments ?? []),
  ];

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
      occupiedAssignments.push(toExistingAssignment(lockedAssignment, slot));
    }

    const requiredStaff = Math.max(1, slot.requiredStaff ?? 1);
    const remainingStaffNeeded = Math.max(0, requiredStaff - lockedEmployeeIds.length);

    for (let staffIndex = 0; staffIndex < remainingStaffNeeded; staffIndex += 1) {
      const selection = selectAssignment({
        seed: `${input.seed}:${staffIndex}`,
        slot,
        taskType,
        employees: input.employees,
        rules: input.rules ?? [],
        assignments: occupiedAssignments,
      });

      if (!selection.assignment) {
        conflicts.push({
          slotId: slot.id,
          taskTypeId: taskType.id,
          date: slot.date,
          reason:
            staffIndex === 0
              ? "No compatible available employee"
              : `Only filled ${staffIndex + lockedEmployeeIds.length} of ${requiredStaff} required staff`,
          rejectedCandidates: selection.rejectedCandidates,
        });
        break;
      }

      assignments.push(selection.assignment);
      occupiedAssignments.push(toExistingAssignment(selection.assignment, slot));
    }
  }

  return {
    assignments: sortAssignments(assignments),
    conflicts,
    diagnostics: {
      seed: input.seed,
      slotCount: input.slots.length,
      assignmentCount: assignments.length,
      conflictCount: conflicts.length,
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
      requirementPriority(left) - requirementPriority(right) ||
      rightSkillCount - leftSkillCount ||
      rightDifficulty - leftDifficulty ||
      left.date.localeCompare(right.date) ||
      leftSortOrder - rightSortOrder ||
      left.slotIndex - right.slotIndex ||
      left.id.localeCompare(right.id)
    );
  });
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

function sortAssignments(assignments: ScheduleAssignment[]) {
  return [...assignments].sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.taskTypeId.localeCompare(right.taskTypeId) ||
      left.slotId.localeCompare(right.slotId),
  );
}
