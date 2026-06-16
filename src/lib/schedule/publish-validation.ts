export type PublishValidationSlot = {
  requirementLevel: string;
  requiredStaff: number;
  status: string;
  label?: string | null;
  taskType: { name: string; code?: string | null };
  shiftBlock: { name: string; startMinute: number; endMinute: number };
  assignments: unknown[];
};

export type PublishValidationInput = {
  scenario: string;
  status: string;
  taskSlots: PublishValidationSlot[];
};

export type PublishIssue = {
  code:
    | "NEEDS_REGENERATION"
    | "EMPTY_SCHEDULE"
    | "NO_ASSIGNMENTS"
    | "REQUIRED_UNFILLED";
  message: string;
};

export function getSchedulePublishIssues(input: PublishValidationInput) {
  const issues: PublishIssue[] = [];

  if (input.status === "NEEDS_REGENERATION") {
    issues.push({
      code: "NEEDS_REGENERATION",
      message: "Generate a new draft before publishing this invalidated schedule.",
    });
  }

  if (input.scenario === "CLINIC_CLOSED") {
    return issues;
  }

  if (input.taskSlots.length === 0) {
    issues.push({
      code: "EMPTY_SCHEDULE",
      message: "No visible task slots were generated for this date.",
    });
    return issues;
  }

  const assignmentCount = input.taskSlots.reduce(
    (count, slot) => count + slot.assignments.length,
    0,
  );

  if (assignmentCount === 0) {
    issues.push({
      code: "NO_ASSIGNMENTS",
      message: "No employees are assigned to this schedule.",
    });
  }

  for (const slot of input.taskSlots) {
    if (slot.taskType.code === "ALLERGY_SHOTS") {
      continue;
    }

    if (
      slot.requirementLevel !== "REQUIRED" ||
      (slot.status !== "SHORTAGE" &&
        slot.assignments.length >= slot.requiredStaff)
    ) {
      continue;
    }

    issues.push({
      code: "REQUIRED_UNFILLED",
      message: `${slot.shiftBlock.name}: ${slot.label ?? slot.taskType.name} is unfilled.`,
    });
  }

  return issues;
}
