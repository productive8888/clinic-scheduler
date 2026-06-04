import { writeAuditLog } from "@/lib/audit";
import { generateBackgroundTaskSlotsForRange } from "@/lib/db/background-generation";
import { getDb } from "@/lib/db";
import {
  ensureScheduleDayWithDefaultSlots,
  generateScheduleForDate,
  getScheduleBoard,
  publishScheduleForDate,
  unpublishScheduleForDate,
} from "@/lib/db/schedule";
import {
  clinicWeekRange,
  monthCalendarRange,
  planScheduleRange,
  planUnpublishScheduleRange,
} from "@/lib/schedule/range";
import {
  buildWeekDayHealth,
  buildWeekStaffSummary,
  summarizeShiftBlocks,
} from "@/lib/schedule/views";
import { getSchedulePublishIssues } from "@/lib/schedule/publish-validation";
import { LEGACY_SHIFT_TEMPLATE_ID } from "@/lib/shifts/legacy";
import { enumerateIsoDates, parseIsoDate, toIsoDate } from "@/lib/utils/date";

export type BulkGenerationSummary = {
  startDate: string;
  endDate: string;
  datesProcessed: number;
  datesGenerated: number;
  scheduleDaysCreated: number;
  scheduleDaysUpdated: number;
  shiftBlocks: number;
  shiftBlocksCreated: number;
  amShiftBlocks: number;
  pmShiftBlocks: number;
  saturdayShiftBlocks: number;
  taskSlots: number;
  taskSlotsCreated: number;
  clinicSlots: number;
  backgroundSlots: number;
  backgroundDefinitionCount: number;
  backgroundInstanceCount: number;
  assignmentsFilled: number;
  assignmentsGenerated: number;
  unfilledSlots: number;
  requiredSlotsUnfilled: number;
  shortages: number;
  unresolvedShortages: number;
  schedulesRequiringRegeneration: number;
  datesRegenerated: number;
  conflicts: number;
  employeesUnderTarget: number;
  employeesOverTarget: number;
  datesNeedingManualReview: string[];
  generationDiagnostics: Array<{
    date: string;
    employeeCount: number;
    employeesWithAvailability: number;
    slotCount: number;
    requiredSlotCount: number;
    assignmentCount: number;
    conflictCount: number;
    firstConflictReasons: unknown[];
  }>;
  skippedClosedDates: string[];
  skippedSundays: string[];
  publishedDatesSkipped: string[];
  publishedDatesOverwritten: string[];
  backgroundSlotsCreated: number;
  backgroundSkippedDefinitions: string[];
  backgroundSkippedPeriods: string[];
  configurationWarnings: string[];
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
    datesProcessed: 0,
    datesGenerated: 0,
    scheduleDaysCreated: 0,
    scheduleDaysUpdated: 0,
    shiftBlocks: 0,
    shiftBlocksCreated: 0,
    amShiftBlocks: 0,
    pmShiftBlocks: 0,
    saturdayShiftBlocks: 0,
    taskSlots: 0,
    taskSlotsCreated: 0,
    clinicSlots: 0,
    backgroundSlots: 0,
    backgroundDefinitionCount: 0,
    backgroundInstanceCount: 0,
    assignmentsFilled: 0,
    assignmentsGenerated: 0,
    unfilledSlots: 0,
    requiredSlotsUnfilled: 0,
    shortages: 0,
    unresolvedShortages: 0,
    schedulesRequiringRegeneration: 0,
    datesRegenerated: 0,
    conflicts: 0,
    employeesUnderTarget: 0,
    employeesOverTarget: 0,
    datesNeedingManualReview: [],
    generationDiagnostics: [],
    skippedClosedDates: [],
    skippedSundays: [],
    publishedDatesSkipped: [],
    publishedDatesOverwritten: [],
    backgroundSlotsCreated: 0,
    backgroundSkippedDefinitions: [],
    backgroundSkippedPeriods: [],
    configurationWarnings: await getGenerationConfigurationWarnings(),
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

  const beforeBoards = new Map(
    await Promise.all(
      datesToGenerate.map(async (date) => [date, await getScheduleBoard(date)] as const),
    ),
  );

  if (datesToGenerate.length > 0) {
    for (const date of datesToGenerate) {
      await ensureScheduleDayWithDefaultSlots(date, input.actorEmployeeId);
    }

    const backgroundSummary = await generateBackgroundTaskSlotsForRange({
      startDate: input.startDate,
      endDate: input.endDate,
      allowedDates: datesToGenerate,
      includePublished: input.overwritePublished,
      actorEmployeeId: input.actorEmployeeId,
    });
    summary.backgroundDefinitionCount = backgroundSummary.definitionCount;
    summary.backgroundInstanceCount = backgroundSummary.instanceCount;
    summary.backgroundSlotsCreated = backgroundSummary.slotsCreated;
    summary.backgroundSkippedDefinitions = backgroundSummary.skippedDefinitions;
    summary.backgroundSkippedPeriods = backgroundSummary.skippedPeriods;
  }

  for (const date of datesToGenerate) {
    const beforeBoard = beforeBoards.get(date) ?? null;
    const result = await generateScheduleForDate({
      date,
      seed: `${input.seedPrefix}:${date}`,
      actorEmployeeId: input.actorEmployeeId,
    });
    const board = await getScheduleBoard(date);

    if (!board) {
      continue;
    }

    summary.datesProcessed += 1;
    summary.datesGenerated += 1;
    if (beforeBoard) {
      summary.scheduleDaysUpdated += 1;
    } else {
      summary.scheduleDaysCreated += 1;
    }
    summary.shiftBlocks += board.shiftBlocks.length;
    const shiftSummary = summarizeShiftBlocks({
      date,
      shiftBlocks: board.shiftBlocks,
    });
    summary.amShiftBlocks += shiftSummary.am;
    summary.pmShiftBlocks += shiftSummary.pm;
    summary.saturdayShiftBlocks += shiftSummary.saturday;
    summary.shiftBlocksCreated += Math.max(
      0,
      board.shiftBlocks.length - (beforeBoard?.shiftBlocks.length ?? 0),
    );
    summary.taskSlots += board.taskSlots.length;
    summary.taskSlotsCreated += Math.max(
      0,
      board.taskSlots.length - (beforeBoard?.taskSlots.length ?? 0),
    );
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
    summary.assignmentsGenerated += result.diagnostics.assignmentCount;
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
    summary.requiredSlotsUnfilled += board.taskSlots.filter(
      (slot) =>
        slot.requirementLevel === "REQUIRED" &&
        slot.assignments.length < slot.requiredStaff,
    ).length;
    summary.schedulesRequiringRegeneration +=
      board.status === "NEEDS_REGENERATION" ? 1 : 0;
    summary.datesRegenerated += beforeBoard ? 1 : 0;
    summary.conflicts += result.diagnostics.conflictCount;
    summary.generationDiagnostics.push({
      date,
      employeeCount: result.diagnostics.employeeCount,
      employeesWithAvailability: result.diagnostics.employeesWithAvailability,
      slotCount: result.diagnostics.slotCount,
      requiredSlotCount: result.diagnostics.requiredSlotCount,
      assignmentCount: result.diagnostics.assignmentCount,
      conflictCount: result.diagnostics.conflictCount,
      firstConflictReasons: result.diagnostics.firstConflictReasons,
    });

    if (
      getSchedulePublishIssues(board).length > 0 ||
      result.diagnostics.conflictCount > 0
    ) {
      summary.datesNeedingManualReview.push(date);
    }

    if (board.scenario === "CLINIC_CLOSED") {
      summary.skippedClosedDates.push(date);
    }
  }

  const targetSummary = await getRangeWeeklyTargetSummary(datesToGenerate);
  summary.employeesUnderTarget = targetSummary.underTarget;
  summary.employeesOverTarget = targetSummary.overTarget;

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

export async function unpublishScheduleRange(input: {
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
  const plan = planUnpublishScheduleRange({
    startDate: input.startDate,
    endDate: input.endDate,
    publishedDates: days
      .filter((day) => day.status === "PUBLISHED")
      .map((day) => toIsoDate(day.date)),
  });
  const summary = {
    startDate: input.startDate,
    endDate: input.endDate,
    unpublishedDates: [] as string[],
    skippedNotPublishedDates: [] as string[],
  };

  for (const item of plan) {
    if (item.action === "SKIP_NOT_PUBLISHED") {
      summary.skippedNotPublishedDates.push(item.date);
      continue;
    }

    await unpublishScheduleForDate({
      date: item.date,
      actorEmployeeId: input.actorEmployeeId,
    });
    summary.unpublishedDates.push(item.date);
  }

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "schedule.range_unpublish",
    entityType: "ScheduleRange",
    entityId: `${input.startDate}:${input.endDate}`,
    after: summary,
  });

  return summary;
}

export async function getScheduleWeekData(anchorDate: string) {
  const range = clinicWeekRange(anchorDate);
  const [
    scheduleDays,
    ptoRequests,
    nptoRequests,
    employees,
    backgroundDefinitionCount,
    backgroundStaffingRuleCount,
    configurationWarnings,
  ] =
    await Promise.all([
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
    getDb().backgroundTaskDefinition.count({
      where: {
        active: true,
        taskTypeId: { not: null },
        taskType: { active: true, isBackground: true },
      },
    }),
    getDb().staffingRequirementRule.count({
      where: {
        active: true,
        taskType: { active: true, isBackground: true },
      },
    }),
    getGenerationConfigurationWarnings(),
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
    backgroundDefinitionCount,
    backgroundStaffingRuleCount,
    configurationWarnings,
    publishBlockingDays: scheduleDays
      .map((day) => ({
        date: toIsoDate(day.date),
        issues: getSchedulePublishIssues(day),
      }))
      .filter((day) => day.issues.length > 0),
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
              : employee.totalHours < employee.targetHours
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
            isBackground: slot.taskType.isBackground,
          })),
          ptoCount: countRequestsOnDate(date, ptoRequests),
          nptoCount: countRequestsOnDate(date, nptoRequests),
        }),
      };
    }),
  };
}

export async function getScheduleCalendarData(anchorDate: string) {
  const range = monthCalendarRange(anchorDate);
  const [scheduleDays, ptoRequests, nptoRequests, configurationWarnings] =
    await Promise.all([
      getDb().scheduleDay.findMany({
        where: {
          date: {
            gte: parseIsoDate(range.gridStartDate),
            lte: parseIsoDate(range.gridEndDate),
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
            include: {
              taskType: { select: { name: true } },
              shiftBlock: {
                select: {
                  name: true,
                  startMinute: true,
                  endMinute: true,
                },
              },
              assignments: {
                where: { status: "ACTIVE" },
                select: { id: true },
              },
            },
          },
        },
      }),
      getDb().pTORequest.findMany({
        where: {
          status: { in: ["APPROVED", "OVERRIDDEN"] },
          startDate: { lte: parseIsoDate(range.gridEndDate) },
          endDate: { gte: parseIsoDate(range.gridStartDate) },
        },
        select: { startDate: true, endDate: true },
      }),
      getDb().nPTORequest.findMany({
        where: {
          status: { in: ["APPROVED", "OVERRIDDEN"] },
          startDate: { lte: parseIsoDate(range.gridEndDate) },
          endDate: { gte: parseIsoDate(range.gridStartDate) },
        },
        select: { startDate: true, endDate: true },
      }),
      getGenerationConfigurationWarnings(),
    ]);
  const scheduleDaysByDate = new Map(
    scheduleDays.map((day) => [toIsoDate(day.date), day]),
  );
  const calendarDays = enumerateIsoDates(
    range.gridStartDate,
    range.gridEndDate,
  ).map((date) => {
    const scheduleDay = scheduleDaysByDate.get(date);
    const publishIssues = scheduleDay
      ? getSchedulePublishIssues(scheduleDay)
      : [];

    return {
      date,
      inMonth: date >= range.monthStartDate && date <= range.monthEndDate,
      status: scheduleDay?.status ?? ("NOT_GENERATED" as const),
      scenario: scheduleDay?.scenario ?? null,
      shiftBlockCount: scheduleDay?.shiftBlocks.length ?? 0,
      taskSlotCount: scheduleDay?.taskSlots.length ?? 0,
      assignmentCount:
        scheduleDay?.taskSlots.reduce(
          (count, slot) => count + slot.assignments.length,
          0,
        ) ?? 0,
      shortageCount:
        scheduleDay?.taskSlots.filter((slot) => slot.status === "SHORTAGE")
          .length ?? 0,
      unfilledRequiredCount:
        scheduleDay?.taskSlots.filter(
          (slot) =>
            slot.requirementLevel === "REQUIRED" &&
            slot.assignments.length < slot.requiredStaff,
        ).length ?? 0,
      ptoCount: countRequestsOnDate(date, ptoRequests),
      nptoCount: countRequestsOnDate(date, nptoRequests),
      canPublish: Boolean(
        scheduleDay &&
          scheduleDay.status !== "PUBLISHED" &&
          publishIssues.length === 0,
      ),
      canUnpublish: scheduleDay?.status === "PUBLISHED",
    };
  });

  return {
    range,
    configurationWarnings,
    weeks: chunk(calendarDays, 7),
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

async function getGenerationConfigurationWarnings() {
  const [shiftTemplates, staffingRules] = await Promise.all([
    getDb().shiftTemplate.findMany({
      where: {
        active: true,
        id: { not: LEGACY_SHIFT_TEMPLATE_ID },
      },
      select: {
        shiftCategory: true,
        notes: true,
      },
    }),
    getDb().staffingRequirementRule.findMany({
      where: { active: true },
      select: {
        notes: true,
        shiftTemplate: { select: { shiftCategory: true } },
        taskType: { select: { isBackground: true } },
      },
    }),
  ]);
  const warnings: string[] = [];
  const eastonTemplates = shiftTemplates.filter((template) =>
    template.notes?.startsWith("Easton spreadsheet default:"),
  );
  const eastonRules = staffingRules.filter((rule) =>
    rule.notes?.startsWith("Easton spreadsheet default:"),
  );

  if (shiftTemplates.length === 0) {
    warnings.push("No active shift templates are configured.");
  }

  if (eastonTemplates.length > 0 && eastonRules.length === 0) {
    warnings.push(
      "Easton shift templates exist, but Easton staffing demand has not been applied. Apply the reviewed workbook defaults before generating.",
    );
  }

  if (
    eastonTemplates.some((template) => template.shiftCategory === "PM") &&
    !eastonRules.some((rule) => rule.shiftTemplate?.shiftCategory === "PM")
  ) {
    warnings.push(
      "PM shift templates exist without PM staffing requirements, so PM blocks will remain empty.",
    );
  }

  if (
    eastonRules.length > 0 &&
    !eastonRules.some((rule) => rule.taskType.isBackground)
  ) {
    warnings.push(
      "Easton staffing rules do not include shift-specific background demand.",
    );
  }

  return warnings;
}

async function getRangeWeeklyTargetSummary(dates: string[]) {
  const weekStarts = [
    ...new Set(dates.map((date) => clinicWeekRange(date).startDate)),
  ].sort();
  let underTarget = 0;
  let overTarget = 0;

  for (const weekStart of weekStarts) {
    const week = await getScheduleWeekData(weekStart);
    underTarget += week.weeklyHourWarnings.filter(
      (warning) => warning.status === "BELOW_TARGET",
    ).length;
    overTarget += week.weeklyHourWarnings.filter(
      (warning) => warning.status === "ABOVE_TARGET",
    ).length;
  }

  return { underTarget, overTarget };
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
