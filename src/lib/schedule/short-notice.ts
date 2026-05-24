import { parseIsoDate, toIsoDate } from "@/lib/utils/date";

export const SHORT_NOTICE_DAYS = 7;

export function daysUntilAffectedDate(input: {
  createdAt: Date | string;
  affectedDate: Date | string;
}) {
  const createdDate = parseIsoDate(toIsoDate(input.createdAt));
  const affectedDate = parseIsoDate(toIsoDate(input.affectedDate));
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return Math.round(
    (affectedDate.getTime() - createdDate.getTime()) / millisecondsPerDay,
  );
}

export function isShortNoticeForDate(input: {
  createdAt: Date | string;
  affectedDate: Date | string;
  thresholdDays?: number;
}) {
  const daysUntil = daysUntilAffectedDate(input);
  const thresholdDays = input.thresholdDays ?? SHORT_NOTICE_DAYS;

  return daysUntil >= 0 && daysUntil <= thresholdDays;
}

export function isShortNoticeForDateRange(input: {
  createdAt: Date | string;
  startDate: Date | string;
  endDate: Date | string;
  thresholdDays?: number;
}) {
  const start = parseIsoDate(toIsoDate(input.startDate));
  const end = parseIsoDate(toIsoDate(input.endDate));
  const cursor = new Date(start);

  while (cursor <= end) {
    if (
      isShortNoticeForDate({
        createdAt: input.createdAt,
        affectedDate: cursor,
        thresholdDays: input.thresholdDays,
      })
    ) {
      return true;
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return false;
}

export function isShortNoticeScheduleChange(input: {
  changedAt: Date | string;
  shiftDate: Date | string;
  thresholdDays?: number;
}) {
  return isShortNoticeForDate({
    createdAt: input.changedAt,
    affectedDate: input.shiftDate,
    thresholdDays: input.thresholdDays,
  });
}
