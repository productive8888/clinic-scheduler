export function buildWholeDayShiftGroups<
  TShiftBlock extends { id: string },
  TTaskSlot extends { shiftBlockId: string },
>(input: { shiftBlocks: TShiftBlock[]; taskSlots: TTaskSlot[] }) {
  const taskSlotsByShiftBlockId = new Map<string, TTaskSlot[]>();

  for (const slot of input.taskSlots) {
    const slots = taskSlotsByShiftBlockId.get(slot.shiftBlockId) ?? [];
    slots.push(slot);
    taskSlotsByShiftBlockId.set(slot.shiftBlockId, slots);
  }

  return input.shiftBlocks.map((shiftBlock) => ({
    shiftBlock,
    slots: taskSlotsByShiftBlockId.get(shiftBlock.id) ?? [],
  }));
}

export function buildWeekDayHealth(input: {
  status: string;
  slots: Array<{
    status: string;
    requirementLevel: string;
    requiredStaff: number;
    assignmentCount: number;
  }>;
  ptoCount: number;
  nptoCount: number;
}) {
  return {
    status: input.status,
    taskSlotCount: input.slots.length,
    shortageCount: input.slots.filter((slot) => slot.status === "SHORTAGE").length,
    unfilledRequiredCount: input.slots.filter(
      (slot) =>
        slot.requirementLevel === "REQUIRED" &&
        slot.assignmentCount < slot.requiredStaff,
    ).length,
    ptoCount: input.ptoCount,
    nptoCount: input.nptoCount,
  };
}
