export function patternPreferredEmployeeIdsForSlot(input: {
  slot: {
    taskTypeId: string;
    slotIndex: number;
    shiftBlock: {
      shiftTemplateId: string | null;
      shiftCategory: string;
    };
  };
  patternSlots: Array<{
    taskTypeId: string;
    slotIndex: number;
    shiftTemplateId: string | null;
    shiftCategory: string | null;
    preferredEmployeeId: string | null;
  }>;
}) {
  return input.patternSlots
    .filter((patternSlot) => {
      if (patternSlot.taskTypeId !== input.slot.taskTypeId) {
        return false;
      }

      if (patternSlot.slotIndex !== input.slot.slotIndex) {
        return false;
      }

      if (
        patternSlot.shiftTemplateId &&
        patternSlot.shiftTemplateId !== input.slot.shiftBlock.shiftTemplateId
      ) {
        return false;
      }

      if (
        patternSlot.shiftCategory &&
        patternSlot.shiftCategory !== input.slot.shiftBlock.shiftCategory
      ) {
        return false;
      }

      return Boolean(patternSlot.preferredEmployeeId);
    })
    .map((patternSlot) => patternSlot.preferredEmployeeId!)
    .sort();
}
