import { getDb } from "@/lib/db";
import { generateScheduleForDate } from "@/lib/db/schedule";
import { enumerateIsoDates, parseIsoDate, toIsoDate } from "@/lib/utils/date";

export async function regenerateExistingScheduleDaysForRange(input: {
  seedPrefix: string;
  startDate: string;
  endDate: string;
  actorEmployeeId?: string | null;
}) {
  const candidateDates = enumerateIsoDates(input.startDate, input.endDate);
  const scheduleDays = await getDb().scheduleDay.findMany({
    where: {
      date: {
        in: candidateDates.map(parseIsoDate),
      },
      status: { not: "LOCKED" },
    },
    orderBy: { date: "asc" },
    select: { date: true },
  });

  const regeneratedDates: string[] = [];

  for (const scheduleDay of scheduleDays) {
    const date = toIsoDate(scheduleDay.date);

    await generateScheduleForDate({
      date,
      seed: `${input.seedPrefix}-${date}`,
      actorEmployeeId: input.actorEmployeeId,
    });
    regeneratedDates.push(date);
  }

  return regeneratedDates;
}
