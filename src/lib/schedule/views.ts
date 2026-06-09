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

export function summarizeShiftBlocks(input: {
  date: string;
  shiftBlocks: Array<{
    shiftCategory: string;
    startMinute: number;
    endMinute: number;
    paidHours: unknown;
  }>;
}) {
  const isSaturday =
    new Date(`${input.date}T00:00:00.000Z`).getUTCDay() === 6;
  const weekday = new Date(`${input.date}T00:00:00.000Z`).getUTCDay();

  return {
    total: input.shiftBlocks.length,
    am: input.shiftBlocks.filter((block) => block.shiftCategory === "AM").length,
    pm: input.shiftBlocks.filter((block) => block.shiftCategory === "PM").length,
    saturday: input.shiftBlocks.filter(
      (block) =>
        isSaturday ||
        block.shiftCategory === "SATURDAY" ||
        block.shiftCategory === "ENDO",
    ).length,
    amEarly: input.shiftBlocks.filter(
      (block) =>
        block.shiftCategory === "AM" &&
        block.startMinute === 7 * 60 &&
        block.endMinute === 12 * 60 &&
        Number(block.paidHours) === 5,
    ).length,
    amRegular: input.shiftBlocks.filter(
      (block) =>
        block.shiftCategory === "AM" &&
        block.startMinute === 8 * 60 &&
        block.endMinute === 12 * 60 &&
        Number(block.paidHours) === 4,
    ).length,
    pmRegular: input.shiftBlocks.filter(
      (block) =>
        block.shiftCategory === "PM" &&
        block.startMinute === 13 * 60 &&
        block.endMinute === 17 * 60 &&
        Number(block.paidHours) === 4,
    ).length,
    mondayPmLong: input.shiftBlocks.filter(
      (block) =>
        weekday === 1 &&
        block.shiftCategory === "PM" &&
        block.startMinute === 13 * 60 &&
        block.endMinute === 18 * 60 &&
        Number(block.paidHours) === 5,
    ).length,
    saturdayEndoscopy: input.shiftBlocks.filter(
      (block) =>
        block.shiftCategory === "ENDO" &&
        block.startMinute === 6 * 60 &&
        block.endMinute === 14 * 60 &&
        Number(block.paidHours) === 8,
    ).length,
    saturdayRegular: input.shiftBlocks.filter(
      (block) =>
        block.shiftCategory === "SATURDAY" &&
        block.startMinute === 8 * 60 &&
        block.endMinute === 14 * 60 &&
        Number(block.paidHours) === 6,
    ).length,
  };
}

export function buildWeekDayHealth(input: {
  status: string;
  slots: Array<{
    status: string;
    requirementLevel: string;
    requiredStaff: number;
    assignmentCount: number;
    isBackground?: boolean;
  }>;
  ptoCount: number;
  nptoCount: number;
}) {
  return {
    status: input.status,
    taskSlotCount: input.slots.length,
    assignmentCount: input.slots.reduce(
      (count, slot) => count + slot.assignmentCount,
      0,
    ),
    filledClinicSlotCount: input.slots.filter(
      (slot) => !slot.isBackground && slot.assignmentCount >= slot.requiredStaff,
    ).length,
    unfilledClinicSlotCount: input.slots.filter(
      (slot) => !slot.isBackground && slot.assignmentCount < slot.requiredStaff,
    ).length,
    backgroundSlotCount: input.slots.filter((slot) => slot.isBackground).length,
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

export type WeekStaffAssignmentInput = {
  employeeId: string;
  date: string;
  shiftBlockId: string;
  shiftName: string;
  shiftCategory: string;
  startMinute: number;
  endMinute: number;
  paidHours: number;
  taskTypeCode: string;
  taskTypeName: string;
  isPatientFacing: boolean;
  isBackground: boolean;
  isEndoscopy: boolean;
  locked: boolean;
};

export function buildWeekStaffSummary(input: {
  employees: Array<{
    id: string;
    fullName: string;
    targetHours: number;
  }>;
  assignments: WeekStaffAssignmentInput[];
}) {
  const assignmentsByEmployee = new Map<string, WeekStaffAssignmentInput[]>();

  for (const assignment of input.assignments) {
    const assignments = assignmentsByEmployee.get(assignment.employeeId) ?? [];
    assignments.push(assignment);
    assignmentsByEmployee.set(assignment.employeeId, assignments);
  }

  return input.employees.map((employee) => {
    const assignments = (assignmentsByEmployee.get(employee.id) ?? []).sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.startMinute - right.startMinute ||
        left.taskTypeName.localeCompare(right.taskTypeName),
    );
    const shifts = new Map<
      string,
      {
        paidHours: number;
        patientFacing: boolean;
        background: boolean;
        saturdayOrEndoscopy: boolean;
      }
    >();
    const assignmentsByDate: Record<string, WeekStaffAssignmentInput[]> = {};
    const exposure = { GI: 0, ALLERGY: 0, PCP: 0 };

    for (const assignment of assignments) {
      const dateAssignments = assignmentsByDate[assignment.date] ?? [];
      dateAssignments.push(assignment);
      assignmentsByDate[assignment.date] = dateAssignments;

      const shiftKey = `${assignment.date}:${assignment.shiftBlockId}`;
      const shift = shifts.get(shiftKey) ?? {
        paidHours: assignment.paidHours,
        patientFacing: false,
        background: false,
        saturdayOrEndoscopy: false,
      };
      shift.patientFacing ||= assignment.isPatientFacing;
      shift.background ||= assignment.isBackground;
      shift.saturdayOrEndoscopy ||=
        assignment.isEndoscopy ||
        assignment.shiftCategory === "ENDO" ||
        assignment.shiftCategory === "SATURDAY" ||
        new Date(`${assignment.date}T00:00:00.000Z`).getUTCDay() === 6;
      shifts.set(shiftKey, shift);

      const group = taskExposureGroup(assignment.taskTypeCode);
      if (group) {
        exposure[group] += 1;
      }
    }

    const uniqueShifts = [...shifts.values()];

    return {
      employeeId: employee.id,
      fullName: employee.fullName,
      targetHours: employee.targetHours,
      totalHours: uniqueShifts.reduce((total, shift) => total + shift.paidHours, 0),
      patientFacingShiftCount: uniqueShifts.filter((shift) => shift.patientFacing)
        .length,
      backgroundShiftCount: uniqueShifts.filter((shift) => shift.background).length,
      backgroundAssignmentCount: assignments.filter(
        (assignment) =>
          assignment.taskTypeCode === "BACKGROUND" || assignment.isBackground,
      ).length,
      saturdayEndoscopyCount: uniqueShifts.filter(
        (shift) => shift.saturdayOrEndoscopy,
      ).length,
      exposure,
      assignmentsByDate,
    };
  });
}

export function taskExposureGroup(taskTypeCode: string) {
  if (taskTypeCode.includes("GI")) {
    return "GI" as const;
  }

  if (taskTypeCode.includes("ALLERGY")) {
    return "ALLERGY" as const;
  }

  if (taskTypeCode === "FOLLOWUP" || taskTypeCode.includes("PCP")) {
    return "PCP" as const;
  }

  return null;
}
