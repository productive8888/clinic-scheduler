import {
  addDaysIsoDate,
  enumerateIsoDates,
  parseIsoDate,
  toIsoDate,
} from "@/lib/utils/date";

export type ScheduleRangeMode = "DAY" | "WEEK" | "MONTH" | "CUSTOM";

export function resolveScheduleRange(input: {
  mode: ScheduleRangeMode;
  date: string;
  customStartDate?: string | null;
  customEndDate?: string | null;
}) {
  if (input.mode === "CUSTOM") {
    const startDate = input.customStartDate || input.date;
    const endDate = input.customEndDate || startDate;

    return endDate < startDate
      ? { startDate, endDate: startDate }
      : { startDate, endDate };
  }

  if (input.mode === "WEEK") {
    return clinicWeekRange(input.date);
  }

  if (input.mode === "MONTH") {
    const parsed = parseIsoDate(input.date);
    const startDate = toIsoDate(
      new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1)),
    );
    const endDate = toIsoDate(
      new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)),
    );

    return { startDate, endDate };
  }

  return { startDate: input.date, endDate: input.date };
}

export function clinicWeekRange(date: string) {
  const parsed = parseIsoDate(date);
  const weekday = parsed.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const startDate = addDaysIsoDate(date, mondayOffset);

  return {
    startDate,
    endDate: addDaysIsoDate(startDate, 5),
  };
}

export function monthCalendarRange(date: string) {
  const parsed = parseIsoDate(date);
  const monthStart = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1),
  );
  const monthEnd = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0),
  );
  const monthStartDate = toIsoDate(monthStart);
  const monthEndDate = toIsoDate(monthEnd);
  const startWeekday = monthStart.getUTCDay();
  const mondayOffset = startWeekday === 0 ? -6 : 1 - startWeekday;
  const endWeekday = monthEnd.getUTCDay();
  const sundayOffset = endWeekday === 0 ? 0 : 7 - endWeekday;

  return {
    monthStartDate,
    monthEndDate,
    gridStartDate: addDaysIsoDate(monthStartDate, mondayOffset),
    gridEndDate: addDaysIsoDate(monthEndDate, sundayOffset),
  };
}

export function planScheduleRange(input: {
  startDate: string;
  endDate: string;
  publishedDates?: string[];
  overwritePublished?: boolean;
}) {
  const publishedDates = new Set(input.publishedDates ?? []);

  return enumerateIsoDates(input.startDate, input.endDate).map((date) => ({
    date,
    action:
      publishedDates.has(date) && !input.overwritePublished
        ? ("SKIP_PUBLISHED" as const)
        : ("GENERATE" as const),
    overwritesPublished:
      publishedDates.has(date) && Boolean(input.overwritePublished),
  }));
}

export function planUnpublishScheduleRange(input: {
  startDate: string;
  endDate: string;
  publishedDates?: string[];
}) {
  const publishedDates = new Set(input.publishedDates ?? []);

  return enumerateIsoDates(input.startDate, input.endDate).map((date) => ({
    date,
    action: publishedDates.has(date)
      ? ("UNPUBLISH" as const)
      : ("SKIP_NOT_PUBLISHED" as const),
  }));
}
