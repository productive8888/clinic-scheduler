export function shouldPreserveSlotOutsideStaffingRequirements(input: {
  source: string;
  taskTypeOptional: boolean;
}) {
  return (
    input.source === "MANUAL" ||
    input.source === "BACKGROUND_DEFINITION" ||
    (input.taskTypeOptional && input.source === "DEFAULT")
  );
}
