import { isEmployeeBgMinimumSlotSource } from "@/lib/schedule/employee-bg-minimum";

export function shouldPreserveSlotOutsideStaffingRequirements(input: {
  source: string;
  taskTypeOptional: boolean;
}) {
  return (
    input.source === "MANUAL" ||
    input.source === "BACKGROUND_DEFINITION" ||
    isEmployeeBgMinimumSlotSource(input.source) ||
    (input.taskTypeOptional && input.source === "DEFAULT")
  );
}
