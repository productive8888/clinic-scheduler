import { writeAuditLog } from "@/lib/audit";
import { AssignmentSource, AssignmentStatus, TaskSlotStatus } from "@prisma/client";
import {
  GENERATED_BACKGROUND_TOP_OFF_SOURCE,
  clearGeneratedBackgroundTopOffSlots,
  topOffBackgroundAssignmentsForRange,
} from "@/lib/db/background-top-off";
import { generateBackgroundTaskSlotsForRange } from "@/lib/db/background-generation";
import { getDb } from "@/lib/db";
import {
  GENERATED_WORK_PATTERN_TOP_OFF_SOURCE,
  clearGeneratedWorkPatternTopOffSlots,
  enforceWorkPatternRequirementsForRange,
} from "@/lib/db/work-pattern-repair";
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
import { getWeeklyHardRequirementSummary } from "@/lib/db/weekly-hard-requirements";
import { eastonWorkPatternGroups } from "@/lib/easton-import/work-patterns";

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
  amEarlyShiftBlocks: number;
  amRegularShiftBlocks: number;
  pmRegularShiftBlocks: number;
  mondayLongPmShiftBlocks: number;
  saturdayEndoscopyShiftBlocks: number;
  saturdayRegularShiftBlocks: number;
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
  hardRequirementIssues: number;
  bgMinimumIssues: number;
  workPatternIssues: number;
  unmatchedTargetIssues: number;
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
  backgroundTopOffSlotsCreated: number;
  backgroundTopOffAssignmentsCreated: number;
  backgroundTopOffIncompleteEmployees: number;
  workPatternTopOffSlotsCreated: number;
  workPatternAssignmentsCreated: number;
  workPatternSwapsMade: number;
  workPatternUnresolved: number;
  workPatternEmployees: number;
  workPatternRequiredExtraDays: number;
  workPatternSatisfiedExtraDays: number;
  missingExtraHourEmployees: number;
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
    amEarlyShiftBlocks: 0,
    amRegularShiftBlocks: 0,
    pmRegularShiftBlocks: 0,
    mondayLongPmShiftBlocks: 0,
    saturdayEndoscopyShiftBlocks: 0,
    saturdayRegularShiftBlocks: 0,
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
    hardRequirementIssues: 0,
    bgMinimumIssues: 0,
    workPatternIssues: 0,
    unmatchedTargetIssues: 0,
    datesNeedingManualReview: [],
    generationDiagnostics: [],
    skippedClosedDates: [],
    skippedSundays: [],
    publishedDatesSkipped: [],
    publishedDatesOverwritten: [],
    backgroundSlotsCreated: 0,
    backgroundTopOffSlotsCreated: 0,
    backgroundTopOffAssignmentsCreated: 0,
    backgroundTopOffIncompleteEmployees: 0,
    workPatternTopOffSlotsCreated: 0,
    workPatternAssignmentsCreated: 0,
    workPatternSwapsMade: 0,
    workPatternUnresolved: 0,
    workPatternEmployees: 0,
    workPatternRequiredExtraDays: 0,
    workPatternSatisfiedExtraDays: 0,
    missingExtraHourEmployees: 0,
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
    await clearGeneratedBackgroundTopOffSlots({
      allowedDates: datesToGenerate,
    });
    await clearGeneratedWorkPatternTopOffSlots({
      allowedDates: datesToGenerate,
    });

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

  const generationResults = new Map<
    string,
    Awaited<ReturnType<typeof generateScheduleForDate>>
  >();

  for (const date of datesToGenerate) {
    const result = await generateScheduleForDate({
      date,
      seed: `${input.seedPrefix}:${date}`,
      actorEmployeeId: input.actorEmployeeId,
    });
    generationResults.set(date, result);
  }

  if (datesToGenerate.length > 0) {
    const workPatternSummary = await enforceWorkPatternRequirementsForRange({
      startDate: input.startDate,
      endDate: input.endDate,
      allowedDates: datesToGenerate,
      actorEmployeeId: input.actorEmployeeId,
    });
    summary.workPatternTopOffSlotsCreated = workPatternSummary.slotsCreated;
    summary.workPatternAssignmentsCreated =
      workPatternSummary.assignmentsCreated;
    summary.workPatternSwapsMade = workPatternSummary.swapsMade;
    summary.workPatternUnresolved = workPatternSummary.unresolved.length;

    const topOffSummary = await topOffBackgroundAssignmentsForRange({
      startDate: input.startDate,
      endDate: input.endDate,
      allowedDates: datesToGenerate,
      actorEmployeeId: input.actorEmployeeId,
    });

    summary.backgroundTopOffSlotsCreated = topOffSummary.slotsCreated;
    summary.backgroundTopOffAssignmentsCreated = topOffSummary.assignmentsCreated;
    summary.backgroundTopOffIncompleteEmployees =
      topOffSummary.employeesMissingBackground.length +
      topOffSummary.employeesUnderExpectedHours.length;
    summary.configurationWarnings.push(...topOffSummary.configurationWarnings);
  }

  for (const date of datesToGenerate) {
    const beforeBoard = beforeBoards.get(date) ?? null;
    const result = generationResults.get(date);
    const board = await getScheduleBoard(date);

    if (!board || !result) {
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
    summary.amEarlyShiftBlocks += shiftSummary.amEarly;
    summary.amRegularShiftBlocks += shiftSummary.amRegular;
    summary.pmRegularShiftBlocks += shiftSummary.pmRegular;
    summary.mondayLongPmShiftBlocks += shiftSummary.mondayPmLong;
    summary.saturdayEndoscopyShiftBlocks += shiftSummary.saturdayEndoscopy;
    summary.saturdayRegularShiftBlocks += shiftSummary.saturdayRegular;
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
  const hardRequirementSummary = await getWeeklyHardRequirementSummary({
    startDate: input.startDate,
    endDate: input.endDate,
  });
  summary.hardRequirementIssues = hardRequirementSummary.issues.length;
  summary.bgMinimumIssues = hardRequirementSummary.bgMinimumIssues.length;
  summary.workPatternIssues = hardRequirementSummary.workPatternIssues.length;
  summary.unmatchedTargetIssues =
    hardRequirementSummary.unmatchedTargetIssues.length;
  const workPatternDiagnostics =
    hardRequirementSummary.employeeDiagnostics.filter(
      (diagnostic) => diagnostic.workPattern.requirement,
    );
  summary.workPatternEmployees = workPatternDiagnostics.length;
  summary.workPatternRequiredExtraDays = workPatternDiagnostics.reduce(
    (count, diagnostic) =>
      count + diagnostic.workPattern.requiredExtraHourWeekdays.length,
    0,
  );
  summary.workPatternSatisfiedExtraDays = workPatternDiagnostics.reduce(
    (count, diagnostic) =>
      count + diagnostic.workPattern.satisfiedExtraHourWeekdays.length,
    0,
  );
  summary.missingExtraHourEmployees = workPatternDiagnostics.filter(
    (diagnostic) => diagnostic.workPattern.missingExtraHourWeekdays.length > 0,
  ).length;

  if (hardRequirementSummary.issues.length > 0) {
    summary.datesNeedingManualReview = [
      ...new Set([...summary.datesNeedingManualReview, ...datesToGenerate]),
    ].sort();
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
  overrideReason?: string | null;
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
  const hardRequirements = await getWeeklyHardRequirementSummary({
    startDate: input.startDate,
    endDate: input.endDate,
  });

  if (hardRequirements.issues.length > 0 && !input.overrideReason?.trim()) {
    const reason = `Weekly hard requirements are unmet. ${hardRequirements.issues
      .slice(0, 6)
      .map((issue) => issue.message)
      .join(" ")}`;

    summary.skippedDates = days.map((day) => ({
      date: toIsoDate(day.date),
      reason,
    }));

    await writeAuditLog({
      actorEmployeeId: input.actorEmployeeId,
      action: "schedule.range_publish_blocked",
      entityType: "ScheduleRange",
      entityId: `${input.startDate}:${input.endDate}`,
      after: {
        ...summary,
        hardRequirementIssueCount: hardRequirements.issues.length,
      },
    });

    return summary;
  }

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
        overrideReason: input.overrideReason,
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
    metadata: {
      overrideReason: input.overrideReason?.trim() || null,
      hardRequirementIssues: hardRequirements.issues,
    },
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

const GENERATED_TASK_SLOT_SOURCES = [
  "DEFAULT",
  "STAFFING_RULE",
  "BACKGROUND_DEFINITION",
  GENERATED_BACKGROUND_TOP_OFF_SOURCE,
  GENERATED_WORK_PATTERN_TOP_OFF_SOURCE,
] as const;

export type ClearGeneratedScheduleSummary = {
  startDate: string;
  endDate: string;
  datesCleared: string[];
  publishedDatesSkipped: string[];
  publishedDatesUnpublished: string[];
  assignmentsRemoved: number;
  taskSlotsCancelled: number;
  shiftBlocksDeactivated: number;
  manualSlotsPreserved: number;
  lockedAssignmentsPreserved: number;
};

export async function clearGeneratedScheduleRange(input: {
  startDate: string;
  endDate: string;
  includePublished?: boolean;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const days = await db.scheduleDay.findMany({
    where: {
      date: {
        gte: parseIsoDate(input.startDate),
        lte: parseIsoDate(input.endDate),
      },
    },
    orderBy: { date: "asc" },
    include: {
      taskSlots: {
        where: { status: { not: "CANCELLED" } },
        select: {
          id: true,
          source: true,
          assignments: {
            where: { status: "ACTIVE" },
            select: { locked: true, source: true },
          },
        },
      },
    },
  });
  const summary: ClearGeneratedScheduleSummary = {
    startDate: input.startDate,
    endDate: input.endDate,
    datesCleared: [],
    publishedDatesSkipped: [],
    publishedDatesUnpublished: [],
    assignmentsRemoved: 0,
    taskSlotsCancelled: 0,
    shiftBlocksDeactivated: 0,
    manualSlotsPreserved: 0,
    lockedAssignmentsPreserved: 0,
  };
  const removedAt = new Date();

  for (const day of days) {
    const date = toIsoDate(day.date);

    if (day.status === "PUBLISHED" && !input.includePublished) {
      summary.publishedDatesSkipped.push(date);
      continue;
    }

    const lockedAssignments = day.taskSlots.flatMap((slot) =>
      slot.assignments.filter((assignment) => assignment.locked),
    );
    summary.lockedAssignmentsPreserved += lockedAssignments.length;
    summary.manualSlotsPreserved += day.taskSlots.filter(
      (slot) =>
        slot.source === "MANUAL" ||
        slot.assignments.some(
          (assignment) =>
            assignment.locked || assignment.source === AssignmentSource.MANUAL_OVERRIDE,
        ),
    ).length;

    const removedAssignments = await db.assignment.updateMany({
      where: {
        taskSlot: { scheduleDayId: day.id },
        status: AssignmentStatus.ACTIVE,
        locked: false,
        source: {
          in: [AssignmentSource.GENERATED, AssignmentSource.COVERAGE_REPLACEMENT],
        },
      },
      data: {
        status: AssignmentStatus.REMOVED,
        removedAt,
      },
    });
    summary.assignmentsRemoved += removedAssignments.count;

    const cancelledSlots = await db.taskSlot.updateMany({
      where: {
        scheduleDayId: day.id,
        status: { not: TaskSlotStatus.CANCELLED },
        source: { in: [...GENERATED_TASK_SLOT_SOURCES] },
        assignments: {
          none: {
            status: AssignmentStatus.ACTIVE,
            locked: true,
          },
        },
      },
      data: {
        status: TaskSlotStatus.CANCELLED,
        notes: "Cleared generated schedule output. Regenerate to recreate from current rules.",
      },
    });
    summary.taskSlotsCancelled += cancelledSlots.count;

    const deactivatedBlocks = await db.shiftBlock.updateMany({
      where: {
        scheduleDayId: day.id,
        active: true,
        source: "TEMPLATE",
        taskSlots: {
          none: {
            status: { not: TaskSlotStatus.CANCELLED },
          },
        },
      },
      data: {
        active: false,
        notes: "Cleared generated schedule output. Regenerate to recreate from current shift templates.",
      },
    });
    summary.shiftBlocksDeactivated += deactivatedBlocks.count;

    await db.scheduleDay.update({
      where: { id: day.id },
      data: {
        status: "DRAFT",
        publishedAt: null,
        publishedByEmployeeId: null,
      },
    });

    if (day.status === "PUBLISHED") {
      summary.publishedDatesUnpublished.push(date);
    }

    summary.datesCleared.push(date);
  }

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "schedule.clear_generated_range",
    entityType: "ScheduleRange",
    entityId: `${input.startDate}:${input.endDate}`,
    after: summary,
    metadata: { includePublished: Boolean(input.includePublished) },
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
    hardRequirements,
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
    getWeeklyHardRequirementSummary(range),
    getGenerationConfigurationWarnings(),
  ]);
  const targetsByEmployeeId = new Map(
    hardRequirements.targets
      .filter((target) => target.employeeId)
      .map((target) => [target.employeeId!, target]),
  );
  const baseStaffRows = buildWeekStaffSummary({
    employees: employees.map((employee) => ({
      id: employee.id,
      fullName: employee.fullName,
      targetHours:
        targetsByEmployeeId.get(employee.id)?.expectedWeeklyHours ??
        Number(employee.workPattern?.targetWeeklyHours ?? employee.expectedWeeklyHours),
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
  const diagnosticsByEmployeeId = new Map(
    hardRequirements.employeeDiagnostics.map((diagnostic) => [
      diagnostic.employeeId,
      diagnostic,
    ]),
  );
  const issuesByEmployeeId = new Map<string, typeof hardRequirements.issues>();

  for (const issue of hardRequirements.issues) {
    if (!issue.employeeId) {
      continue;
    }

    const issues = issuesByEmployeeId.get(issue.employeeId) ?? [];
    issues.push(issue);
    issuesByEmployeeId.set(issue.employeeId, issues);
  }

  const workPatternLabels = new Map(
    eastonWorkPatternGroups().map((group) => [group.code, group.label]),
  );
  const staffRows = baseStaffRows.map((row) => {
    const target = targetsByEmployeeId.get(row.employeeId);
    const diagnostic = diagnosticsByEmployeeId.get(row.employeeId);

    return {
      ...row,
      workPatternLabel: target?.workPatternCode
        ? workPatternLabels.get(target.workPatternCode) ?? target.workPatternCode
        : null,
      requiredBackgroundAssignments:
        target?.requiredBackgroundAssignments ?? 0,
      missingBackgroundAssignments:
        diagnostic?.missingBackgroundAssignments ?? 0,
      extraHourWeekdays: target?.extraHourWeekdays ?? [],
      satisfiedExtraHourWeekdays:
        diagnostic?.workPattern.satisfiedExtraHourWeekdays ?? [],
      missingExtraHourWeekdays:
        diagnostic?.workPattern.missingExtraHourWeekdays ?? [],
      saturdayAssignment: diagnostic?.workPattern.saturdayAssignment ?? null,
      requiredSaturdayShiftCategory:
        diagnostic?.workPattern.requiredSaturdayShiftCategory ?? null,
      requiredSaturdayPaidHours:
        diagnostic?.workPattern.requiredSaturdayPaidHours ?? null,
      hardRequirementIssues: issuesByEmployeeId.get(row.employeeId) ?? [],
    };
  });

  return {
    range,
    backgroundDefinitionCount,
    backgroundStaffingRuleCount,
    hardRequirements,
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
