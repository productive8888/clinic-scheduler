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

    if (slot.lockedEmployeeId) {
      const lockedAssignment: ScheduleAssignment = {
        slotId: slot.id,
        employeeId: slot.lockedEmployeeId,
        taskTypeId: taskType.id,
        date: slot.date,
        source: "LOCKED",
        score: Number.POSITIVE_INFINITY,
      };

      assignments.push(lockedAssignment);
      occupiedAssignments.push(toExistingAssignment(lockedAssignment, slot));
      continue;
    }

    const selection = selectAssignment({
      seed: input.seed,
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
        reason: "No compatible available employee",
        rejectedCandidates: selection.rejectedCandidates,
      });
      continue;
    }

    assignments.push(selection.assignment);
    occupiedAssignments.push(toExistingAssignment(selection.assignment, slot));
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
      rightSkillCount - leftSkillCount ||
      rightDifficulty - leftDifficulty ||
      left.date.localeCompare(right.date) ||
      leftSortOrder - rightSortOrder ||
      left.slotIndex - right.slotIndex ||
      left.id.localeCompare(right.id)
    );
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
