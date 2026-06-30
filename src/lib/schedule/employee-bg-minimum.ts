export const EMPLOYEE_BG_MINIMUM_SOURCE = "EMPLOYEE_BG_MINIMUM";

export function isEmployeeBgMinimumSlotSource(
  source: string | null | undefined,
) {
  return source === EMPLOYEE_BG_MINIMUM_SOURCE;
}
