import { writeAuditLog } from "@/lib/audit";
import { generateBackgroundTaskSlotsForRange } from "@/lib/db/background-generation";
import { getDb } from "@/lib/db";
import {
  generateScheduleForDate,
  getScheduleBoard,
  publishScheduleForDate,
} from "@/lib/db/schedule";
import { clinicWeekRange, planScheduleRange } from "@/lib/schedule/range";
import {
  buildWeekDayHealth,
  buildWeekStaffSummary,
} from "@/lib/schedule/views";
import { LEGACY_SHIFT_TEMPLATE_ID } from "@/lib/shifts/legacy";
import { parseIsoDate, toIsoDate } from "@/lib/utils/date";

export type BulkGenerationSummary = {
  startDate: string;
  endDate: string;
  datesGenerated: number;
  shiftBlocks: number;
  taskSlots: number;
  clinicSlots: number;
  backgroundSlots: number;
  assignmentsFilled: number;
  unfilledSlots: number;
  shortages: number;
  unresolvedShortages: number;
  schedulesRequiringRegeneration: number;
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
    clinicSlots: 0,
    backgroundSlots: 0,
    assignmentsFilled: 0,
    unfilledSlots: 0,
    shortages: 0,
    unresolvedShortages: 0,
    schedulesRequiringRegeneration: 0,
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
    summary.clinicSlots += board.taskSlots.filter(
      (slot) => !slot.taskType.isBackground,
    ).length;
    summary.backgroundSlots += board.taskSlots.filter(
      (slot) => slot.taskType.isBackground,
    ).length;
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
    summary.unresolvedShortages += board.taskSlots.filter(
      (slot) =>
        slot.requirementLevel === "REQUIRED" &&
        (slot.status === "SHORTAGE" ||
          slot.assignments.length < slot.requiredStaff),
    ).length;
    summary.schedulesRequiringRegeneration +=
      board.status === "NEEDS_REGENERATION" ? 1 : 0;
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
          where: {
            active: true,
            source: { notIn: ["MIGRATION", "FALLBACK"] },
            OR: [
              { shiftTemplateId: null },
              { shiftTemplateId: { not: LEGACY_SHIFT_TEMPLATE_ID } },
            ],
          },
          orderBy: [{ startMinute: "asc" }, { name: "asc" }],
        },
        taskSlots: {
          where: {
            status: { not: "CANCELLED" },
            shiftBlock: {
              AND: [
                { source: { notIn: ["MIGRATION", "FALLBACK"] } },
                {
                  OR: [
                    { shiftTemplateId: null },
                    { shiftTemplateId: { not: LEGACY_SHIFT_TEMPLATE_ID } },
                  ],
                },
              ],
            },
          },
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
  const staffRows = buildWeekStaffSummary({
    employees: employees.map((employee) => ({
      id: employee.id,
      fullName: employee.fullName,
      targetHours: Number(
        employee.workPattern?.targetWeeklyHours ?? employee.expectedWeeklyHours,
      ),
    })),
    assignments: scheduleDays.flatMap((day) =>
      day.taskSlots.flatMap((slot) =>
        slot.assignments.map((assignment) => ({
          employeeId: assignment.employeeId,
          date: toIsoDate(day.date),
          shiftBlockId: slot.shiftBlock.id,
          shiftName: slot.shiftBlock.name,
          shiftCategory: slot.shiftBlock.shiftCategory,
          startMinute: slot.shiftBlock.startMinute,
          endMinute: slot.shiftBlock.endMinute,
          paidHours: Number(slot.shiftBlock.paidHours),
          taskTypeCode: slot.taskType.code,
          taskTypeName: slot.taskType.name,
          isPatientFacing: slot.taskType.isPatientFacing,
          isBackground: slot.taskType.isBackground,
          isEndoscopy: slot.taskType.isEndoscopy,
          locked: assignment.locked,
        })),
      ),
    ),
  });

  return {
    range,
    staffRows,
    weeklyHourWarnings: staffRows
      .map((employee) => {
        return {
          employeeId: employee.employeeId,
          fullName: employee.fullName,
          scheduledHours: employee.totalHours,
          targetHours: employee.targetHours,
          status:
            employee.totalHours > employee.targetHours
              ? ("ABOVE_TARGET" as const)
              : employee.totalHours > 0 &&
                  employee.totalHours < employee.targetHours
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
