import { addDaysIsoDate, parseIsoDate, toIsoDate } from "@/lib/utils/date";

export const DEFAULT_PAYROLL_PERIOD_DAYS = 14;
export const PAYROLL_PERIOD_ANCHOR_DATE = "2026-01-05";

export function getPayrollPeriodContaining(
  date: Date | string = new Date(),
  periodDays = DEFAULT_PAYROLL_PERIOD_DAYS,
) {
  const dateIso = typeof date === "string" ? date : toIsoDate(date);
  const anchor = parseIsoDate(PAYROLL_PERIOD_ANCHOR_DATE).getTime();
  const target = parseIsoDate(dateIso).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const dayOffset = Math.floor((target - anchor) / dayMs);
  const periodOffset = Math.floor(dayOffset / periodDays) * periodDays;
  const startDate = addDaysIsoDate(PAYROLL_PERIOD_ANCHOR_DATE, periodOffset);
  const endDate = addDaysIsoDate(startDate, periodDays - 1);

  return { startDate, endDate };
}

export function calculateExpectedHoursForPeriod(input: {
  expectedWeeklyHours: number;
  periodDays: number;
}) {
  return roundToTwo((input.expectedWeeklyHours / 7) * input.periodDays);
}

export function roundToTwo(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
