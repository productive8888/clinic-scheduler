import { formatMinuteOfDay } from "@/lib/utils/time";

export const WEEKDAYS = [
  { value: 0, label: "Sunday", shortLabel: "Sun" },
  { value: 1, label: "Monday", shortLabel: "Mon" },
  { value: 2, label: "Tuesday", shortLabel: "Tue" },
  { value: 3, label: "Wednesday", shortLabel: "Wed" },
  { value: 4, label: "Thursday", shortLabel: "Thu" },
  { value: 5, label: "Friday", shortLabel: "Fri" },
  { value: 6, label: "Saturday", shortLabel: "Sat" },
] as const;

export const STANDARD_SHIFT_START_MINUTE = 8 * 60;
export const STANDARD_SHIFT_END_MINUTE = 17 * 60;

export function isDefaultWorkingWeekday(weekday: number) {
  return weekday >= 1 && weekday <= 5;
}

export function weekdayLabel(weekday: number) {
  return WEEKDAYS.find((day) => day.value === weekday)?.label ?? `Day ${weekday}`;
}

export function weekdayShortLabel(weekday: number) {
  return (
    WEEKDAYS.find((day) => day.value === weekday)?.shortLabel ?? `D${weekday}`
  );
}

export function formatMinuteRange(
  startMinute: number | null | undefined,
  endMinute: number | null | undefined,
) {
  const start = formatMinuteOfDay(startMinute);
  const end = formatMinuteOfDay(endMinute);

  return start && end ? `${start}-${end}` : "All day";
}
