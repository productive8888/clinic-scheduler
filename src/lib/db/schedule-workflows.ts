import { writeAuditLog } from "@/lib/audit";
import { generateBackgroundTaskSlotsForRange } from "@/lib/db/background-generation";
import { getDb } from "@/lib/db";
import {
  generateScheduleForDate,
  getScheduleBoard,
  publishScheduleForDate,
} from "@/lib/db/schedule";
import { clinicWeekRange, planScheduleRange } from "@/lib/schedule/range";
import { buildWeekDayHealth } from "@/lib/schedule/views";
import { parseIsoDate, toIsoDate } from "@/lib/utils/date";

export type BulkGenerationSummary = {
  startDate: string;
  endDate: string;
  datesGenerated: number;
  shiftBlocks: number;
  taskSlots: number;
  assignmentsFilled: number;
  unfilledSlots: number;
  shortages: number;
  conflicts: number;
  skippedClosedDates: string[];
  skippedSundays: string[];
  publishedDatesSkipped: string[];
  publishedDatesOverwritten: string[];
  backgroundSlotsCreated: number;
};

export async function generateScheduleRange(input: {
  startDate: string;
  endDate: string;
  seedPrefix: string;
  overwritePublished?: boolean;
  actorEmployeeId?: string | null;
}) {
  const existing = await getDb().scheduleDay.findMany({
    where: {
      date: {
        gte: parseIsoDate(input.startDate),
        lte: parseIsoDate(input.endDate),
      },
    },
    select: { date: true, status: true },
  });
  const publishedDates = existing
    .filter((day) => day.status === "PUBLISHED")
    .map((day) => toIsoDate(day.date));
  const plan = planScheduleRange({
    startDate: input.startDate,
    endDate: input.endDate,
    publishedDates,
    overwritePublished: input.overwritePublished,
  });
  const summary: BulkGenerationSummary = {
    startDate: input.startDate,
    endDate: input.endDate,
    datesGenerated: 0,
    shiftBlocks: 0,
    taskSlots: 0,
    assignmentsFilled: 0,
    unfilledSlots: 0,
    shortages: 0,
    conflicts: 0,
    skippedClosedDates: [],
    skippedSundays: [],
    publishedDatesSkipped: [],
    publishedDatesOverwritten: [],
    backgroundSlotsCreated: 0,
  };
  const datesToGenerate: string[] = [];

  for (const item of plan) {
    if (parseIsoDate(item.date).getUTCDay() === 0) {
      summary.skippedSundays.push(item.date);
      continue;
    }

    if (item.action === "SKIP_PUBLISHED") {
      summary.publishedDatesSkipped.push(item.date);
      continue;
    }

    datesToGenerate.push(item.date);
    if (item.overwritesPublished) {
      summary.publishedDatesOverwritten.push(item.date);
    }
  }

  if (datesToGenerate.length > 0) {
    const backgroundSummary = await generateBackgroundTaskSlotsForRange({
      startDate: input.startDate,
      endDate: input.endDate,
      allowedDates: datesToGenerate,
      includePublished: input.overwritePublished,
      actorEmployeeId: input.actorEmployeeId,
    });
    summary.backgroundSlotsCreated = backgroundSummary.slotsCreated;
  }

  for (const date of datesToGenerate) {
    const result = await generateScheduleForDate({
      date,
      seed: `${input.seedPrefix}:${date}`,
      actorEmployeeId: input.actorEmployeeId,
    });
    const board = await getScheduleBoard(date);

    if (!board) {
      continue;
    }

    summary.datesGenerated += 1;
    summary.shiftBlocks += board.shiftBlocks.length;
    summary.taskSlots += board.taskSlots.length;
    summary.assignmentsFilled += board.taskSlots.reduce(
      (count, slot) => count + slot.assignments.length,
      0,
    );
    summary.unfilledSlots += board.taskSlots.filter(
      (slot) => slot.assignments.length < slot.requiredStaff,
    ).length;
    summary.shortages += board.taskSlots.filter(
      (slot) => slot.status === "SHORTAGE",
    ).length;
    summary.conflicts += result.diagnostics.conflictCount;

    if (board.scenario === "CLINIC_CLOSED") {
      summary.skippedClosedDates.push(date);
    }
  }

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "schedule.bulk_generate",
    entityType: "ScheduleRange",
    entityId: `${input.startDate}:${input.endDate}`,
    after: summary,
  });

  return summary;
}

export async function publishScheduleRange(input: {
  startDate: string;
  endDate: string;
  actorEmployeeId?: string | null;
}) {
  const days = await getDb().scheduleDay.findMany({
    where: {
      date: {
        gte: parseIsoDate(input.startDate),
        lte: parseIsoDate(input.endDate),
      },
    },
    orderBy: { date: "asc" },
    select: { date: true, status: true },
  });
  const summary = {
    startDate: input.startDate,
    endDate: input.endDate,
    publishedDates: [] as string[],
    alreadyPublishedDates: [] as string[],
    skippedDates: [] as Array<{ date: string; reason: string }>,
  };

  for (const day of days) {
    const date = toIsoDate(day.date);

    if (day.status === "PUBLISHED") {
      summary.alreadyPublishedDates.push(date);
      continue;
    }

    try {
      await publishScheduleForDate({
        date,
        actorEmployeeId: input.actorEmployeeId,
      });
      summary.publishedDates.push(date);
    } catch (error) {
      summary.skippedDates.push({
        date,
        reason: error instanceof Error ? error.message : "Unable to publish",
      });
    }
  }

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "schedule.range_publish",
    entityType: "ScheduleRange",
    entityId: `${input.startDate}:${input.endDate}`,
    after: summary,
  });

  return summary;
}

export async function getScheduleWeekData(anchorDate: string) {
  const range = clinicWeekRange(anchorDate);
  const [scheduleDays, ptoRequests, nptoRequests, employees] = await Promise.all([
    getDb().scheduleDay.findMany({
      where: {
        date: {
          gte: parseIsoDate(range.startDate),
          lte: parseIsoDate(range.endDate),
        },
      },
      orderBy: { date: "asc" },
      include: {
        shiftBlocks: {
          where: { active: true },
          orderBy: [{ startMinute: "asc" }, { name: "asc" }],
        },
        taskSlots: {
          where: { status: { not: "CANCELLED" } },
          orderBy: [
            { shiftBlock: { startMinute: "asc" } },
            { taskType: { sortOrder: "asc" } },
            { slotIndex: "asc" },
          ],
          include: {
            shiftBlock: true,
            taskType: true,
            assignments: {
              where: { status: "ACTIVE" },
              include: { employee: true },
            },
          },
        },
      },
    }),
    getDb().pTORequest.findMany({
      where: {
        status: { in: ["APPROVED", "OVERRIDDEN"] },
        startDate: { lte: parseIsoDate(range.endDate) },
        endDate: { gte: parseIsoDate(range.startDate) },
      },
      select: { startDate: true, endDate: true },
    }),
    getDb().nPTORequest.findMany({
      where: {
        status: { in: ["APPROVED", "OVERRIDDEN"] },
        startDate: { lte: parseIsoDate(range.endDate) },
        endDate: { gte: parseIsoDate(range.startDate) },
      },
      select: { startDate: true, endDate: true },
    }),
    getDb().employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        expectedWeeklyHours: true,
        workPattern: { select: { targetWeeklyHours: true } },
      },
    }),
  ]);
  const scheduledHoursByEmployee = new Map<string, number>();

  for (const day of scheduleDays) {
    for (const slot of day.taskSlots) {
      for (const assignment of slot.assignments) {
        scheduledHoursByEmployee.set(
          assignment.employeeId,
          (scheduledHoursByEmployee.get(assignment.employeeId) ?? 0) +
            Number(slot.shiftBlock.paidHours),
        );
      }
    }
  }

  return {
    range,
    weeklyHourWarnings: employees
      .map((employee) => {
        const scheduledHours = scheduledHoursByEmployee.get(employee.id) ?? 0;
        const targetHours = Number(
          employee.workPattern?.targetWeeklyHours ?? employee.expectedWeeklyHours,
        );

        return {
          employeeId: employee.id,
          fullName: employee.fullName,
          scheduledHours,
          targetHours,
          status:
            scheduledHours > targetHours
              ? ("ABOVE_TARGET" as const)
              : scheduledHours > 0 && scheduledHours < targetHours
                ? ("BELOW_TARGET" as const)
                : ("ON_TARGET" as const),
        };
      })
      .filter((warning) => warning.status !== "ON_TARGET"),
    days: scheduleDays.map((day) => {
      const date = toIsoDate(day.date);

      return {
        ...day,
        date,
        ...buildWeekDayHealth({
          status: day.status,
          slots: day.taskSlots.map((slot) => ({
            status: slot.status,
            requirementLevel: slot.requirementLevel,
            requiredStaff: slot.requiredStaff,
            assignmentCount: slot.assignments.length,
          })),
          ptoCount: countRequestsOnDate(date, ptoRequests),
          nptoCount: countRequestsOnDate(date, nptoRequests),
        }),
      };
    }),
  };
}

function countRequestsOnDate(
  date: string,
  requests: Array<{ startDate: Date; endDate: Date }>,
) {
  return requests.filter(
    (request) =>
      toIsoDate(request.startDate) <= date && toIsoDate(request.endDate) >= date,
  ).length;
}
