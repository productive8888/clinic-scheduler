import type {
  ManualEditAddedAssignment,
  ManualEditAssignmentChange,
  ManualEditBatch,
} from "@/lib/schedule/manual-edit-types";

export type ManualEditDraftAssignment = {
  id: string;
  persistedAssignmentId: string | null;
  slotId: string;
  employeeId: string;
  locked: boolean;
  source: string;
  note: string | null;
};

export type ManualEditDraftSlot = {
  id: string;
  persistedSlotId: string | null;
  scheduleDayId: string;
  date: string;
  shiftBlockId: string;
  taskTypeId: string;
  slotIndex: number;
  requirementLevel: "REQUIRED" | "DESIRED" | "OPTIONAL" | "CONDITIONAL";
  requiredStaff: number;
  source: string;
};

export type ManualEditBaseState = {
  slots: ManualEditDraftSlot[];
  assignments: ManualEditDraftAssignment[];
  shiftBlocks: Array<{ id: string; scheduleDayId: string; date: string }>;
};

export function applyManualEditBatchToState(
  base: ManualEditBaseState,
  batch: ManualEditBatch,
) {
  const slots = [...base.slots];
  const assignments = base.assignments.map((assignment) => ({ ...assignment }));
  const assignmentIndex = new Map(
    assignments.map((assignment, index) => [assignment.id, index]),
  );

  for (const change of batch.assignmentChanges) {
    applyAssignmentChange(assignments, assignmentIndex, change);
  }

  for (const addition of batch.addedAssignments) {
    applyAddedAssignment(assignments, assignmentIndex, addition);
  }

  for (const addition of batch.addedSlots) {
    const shiftBlock = base.shiftBlocks.find(
      (block) => block.id === addition.shiftBlockId,
    );

    if (!shiftBlock || shiftBlock.date !== addition.date) {
      continue;
    }

    slots.push({
      id: addition.clientId,
      persistedSlotId: null,
      scheduleDayId: shiftBlock.scheduleDayId,
      date: addition.date,
      shiftBlockId: addition.shiftBlockId,
      taskTypeId: addition.taskTypeId,
      slotIndex: nextSlotIndex(slots, addition.shiftBlockId, addition.taskTypeId),
      requirementLevel: "OPTIONAL",
      requiredStaff: 1,
      source: "MANUAL",
    });

    if (addition.employeeId) {
      assignments.push({
        id: `${addition.clientId}:assignment`,
        persistedAssignmentId: null,
        slotId: addition.clientId,
        employeeId: addition.employeeId,
        locked: addition.locked,
        source: "MANUAL_OVERRIDE",
        note: addition.note?.trim() || null,
      });
    }
  }

  return {
    slots,
    assignments: assignments.filter((assignment) => assignment.employeeId),
  };
}

function applyAssignmentChange(
  assignments: ManualEditDraftAssignment[],
  assignmentIndex: Map<string, number>,
  change: ManualEditAssignmentChange,
) {
  const index = assignmentIndex.get(change.assignmentId);

  if (index === undefined) {
    return;
  }

  if (!change.employeeId) {
    assignments[index] = { ...assignments[index], employeeId: "" };
    return;
  }

  assignments[index] = {
    ...assignments[index],
    employeeId: change.employeeId,
    locked: change.locked,
    source: "MANUAL_OVERRIDE",
    note: change.note?.trim() || null,
  };
}

function applyAddedAssignment(
  assignments: ManualEditDraftAssignment[],
  assignmentIndex: Map<string, number>,
  addition: ManualEditAddedAssignment,
) {
  if (assignmentIndex.has(addition.clientId)) {
    return;
  }

  assignmentIndex.set(addition.clientId, assignments.length);
  assignments.push({
    id: addition.clientId,
    persistedAssignmentId: null,
    slotId: addition.slotId,
    employeeId: addition.employeeId,
    locked: addition.locked,
    source: "MANUAL_OVERRIDE",
    note: addition.note?.trim() || null,
  });
}

function nextSlotIndex(
  slots: ManualEditDraftSlot[],
  shiftBlockId: string,
  taskTypeId: string,
) {
  return (
    Math.max(
      0,
      ...slots
        .filter(
          (slot) =>
            slot.shiftBlockId === shiftBlockId &&
            slot.taskTypeId === taskTypeId,
        )
        .map((slot) => slot.slotIndex),
    ) + 1
  );
}
