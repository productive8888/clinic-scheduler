import {
  addDaysIsoDate,
  enumerateIsoDates,
  parseIsoDate,
  toIsoDate,
} from "@/lib/utils/date";

export type ScheduleRangeMode = "DAY" | "WEEK" | "MONTH" | "CUSTOM";

export const PUBLISHED_DAYS_PARTIAL_GENERATION_WARNING =
  "This week has published days. Weekly balancing for 40 hours, Saturday rules, BG minimums, and work-pattern rules requires the whole week. If published days are skipped, the result will be partial and weekly validation may be incomplete or stale. Recommended: Unpublish, clear, and regenerate full week.";

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

export function planScheduleGeneration(input: {
  startDate: string;
  endDate: string;
  publishedDates?: string[];
  overwritePublished?: boolean;
}) {
  const datesToGenerate: string[] = [];
  const schedulableDates: string[] = [];
  const skippedSundays: string[] = [];
  const publishedDatesSkipped: string[] = [];
  const publishedDatesOverwritten: string[] = [];

  for (const item of planScheduleRange(input)) {
    if (parseIsoDate(item.date).getUTCDay() === 0) {
      skippedSundays.push(item.date);
      continue;
    }

    schedulableDates.push(item.date);

    if (item.action === "SKIP_PUBLISHED") {
      publishedDatesSkipped.push(item.date);
      continue;
    }

    datesToGenerate.push(item.date);

    if (item.overwritesPublished) {
      publishedDatesOverwritten.push(item.date);
    }
  }

  return {
    datesToGenerate,
    schedulableDates,
    skippedSundays,
    publishedDatesSkipped,
    publishedDatesOverwritten,
    weeks: groupScheduleDatesByClinicWeek(schedulableDates),
    generationWeeks: groupScheduleDatesByClinicWeek(datesToGenerate),
  };
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

export function groupScheduleDatesByClinicWeek(dates: string[]) {
  const datesByWeekStart = new Map<string, string[]>();

  for (const date of [...new Set(dates)].sort()) {
    const weekStart = clinicWeekRange(date).startDate;
    const weekDates = datesByWeekStart.get(weekStart) ?? [];

    weekDates.push(date);
    datesByWeekStart.set(weekStart, weekDates);
  }

  return [...datesByWeekStart.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, weekDates]) => ({
      ...clinicWeekRange(weekStart),
      dates: weekDates,
    }));
}

export function partialGenerationWeekStarts(input: {
  weeks: ReturnType<typeof groupScheduleDatesByClinicWeek>;
  publishedDatesSkipped: string[];
}) {
  const publishedDatesSkipped = new Set(input.publishedDatesSkipped);

  return input.weeks
    .filter((week) =>
      week.dates.some((date) => publishedDatesSkipped.has(date)),
    )
    .map((week) => week.startDate);
}
