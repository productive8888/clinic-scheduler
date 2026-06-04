import type { BackgroundTaskPeriodType } from "@prisma/client";
import {
  addDaysIsoDate,
  enumerateIsoDates,
  parseIsoDate,
  toIsoDate,
} from "@/lib/utils/date";

const PERIOD_ANCHOR_MONDAY = "1970-01-05";

export type BackgroundPeriodDefinition = {
  periodType: BackgroundTaskPeriodType;
  customPeriodDays?: number | null;
};

export type BackgroundPeriodWindow = {
  startDate: string;
  endDate: string;
};

export function enumerateBackgroundPeriods(input: {
  startDate: string;
  endDate: string;
  definition: BackgroundPeriodDefinition;
}) {
  const windows = new Map<string, BackgroundPeriodWindow>();

  for (const date of enumerateIsoDates(input.startDate, input.endDate)) {
    const window = getBackgroundPeriodWindow(date, input.definition);
    windows.set(`${window.startDate}:${window.endDate}`, window);
  }

  return [...windows.values()].sort((left, right) =>
    left.startDate.localeCompare(right.startDate),
  );
}

export function getBackgroundPeriodWindow(
  date: string,
  definition: BackgroundPeriodDefinition,
): BackgroundPeriodWindow {
  if (definition.periodType === "MONTHLY") {
    const parsed = parseIsoDate(date);
    const start = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
    const end = new Date(
      Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0),
    );

    return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
  }

  const periodDays =
    definition.periodType === "WEEKLY"
      ? 7
      : definition.periodType === "BIWEEKLY"
        ? 14
        : Math.max(1, definition.customPeriodDays ?? 7);
  const anchor = parseIsoDate(PERIOD_ANCHOR_MONDAY);
  const target = parseIsoDate(date);
  const daysFromAnchor = Math.floor(
    (target.getTime() - anchor.getTime()) / (24 * 60 * 60 * 1000),
  );
  const periodOffset = Math.floor(daysFromAnchor / periodDays) * periodDays;
  const startDate = addDaysIsoDate(PERIOD_ANCHOR_MONDAY, periodOffset);

  return {
    startDate,
    endDate: addDaysIsoDate(startDate, periodDays - 1),
  };
}

export function backgroundSlotCount(input: {
  requiredCountPerPeriod?: number | null;
  estimatedHoursPerPeriod: number;
  paidHoursPerSlot: number;
}) {
  if (input.requiredCountPerPeriod && input.requiredCountPerPeriod > 0) {
    return Math.floor(input.requiredCountPerPeriod);
  }

  if (input.estimatedHoursPerPeriod <= 0) {
    return 0;
  }

  return Math.ceil(
    input.estimatedHoursPerPeriod / Math.max(0.25, input.paidHoursPerSlot),
  );
}
