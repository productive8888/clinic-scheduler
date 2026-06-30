export type SchedulingRequiredEmployeeInput = {
  active?: boolean | null;
  status?: string | null;
  scheduleEligible?: boolean | null;
  expectedWeeklyHours?: unknown;
};

export function isSchedulingRequiredEmployee(
  employee: SchedulingRequiredEmployeeInput,
) {
  const isActive =
    employee.status !== undefined && employee.status !== null
      ? employee.status === "ACTIVE"
      : employee.active !== false;

  return (
    isActive &&
    employee.scheduleEligible !== false &&
    numberValue(employee.expectedWeeklyHours) > 0
  );
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);

  return Number.isFinite(number) ? number : 0;
}
