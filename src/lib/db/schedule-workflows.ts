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
import { EMPLOYEE_BG_MINIMUM_SOURCE } from "@/lib/schedule/employee-bg-minimum";
import {
  clinicWeekRange,
  groupScheduleDatesByClinicWeek,
  monthCalendarRange,
  partialGenerationWeekStarts,
  planScheduleGeneration,
  planUnpublishScheduleRange,
} from "@/lib/schedule/range";
import {
  buildWeekDayHealth,
  buildWeekStaffSummary,
  summarizeShiftBlocks,
} from "@/lib/schedule/views";
import { getSchedulePublishIssues } from "@/lib/schedule/publish-validation";
import { isJulyPatientShiftTaskType } from "@/lib/schedule/patient-shifts";
import { LEGACY_SHIFT_TEMPLATE_ID } from "@/lib/shifts/legacy";
import { enumerateIsoDates, parseIsoDate, toIsoDate } from "@/lib/utils/date";
import {
  getRangeWeeklyHardRequirementSummary,
  getWeeklyHardRequirementSummary,
} from "@/lib/db/weekly-hard-requirements";
import { eastonWorkPatternGroups } from "@/lib/easton-import/work-patterns";
import {
  getPatientFairnessRepairDiagnosticsForRange,
  repairPatientFairnessForRange,
} from "@/lib/db/patient-fairness-repair";
import {
  getMonthDayPresentation,
  type MonthGenerationWeekSummary,
} from "@/lib/schedule/month";

export type BulkGenerationSummary = {
  startDate: string;
  endDate: string;
  generationScope: "FULL" | "PARTIAL";
  weeklyValidationPartial: boolean;
  partialWeekStarts: string[];
  validationMessage: string | null;
  datesProcessed: number;
  datesGenerated: number;
  weeksProcessed: number;
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
  saturdayIssues: number;
  unmatchedTargetIssues: number;
  weekSummaries: MonthGenerationWeekSummary[];
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
  backgroundRoleMixSwapsMade: number;
  backgroundTopOffIncompleteEmployees: number;
  patientRangeSwapsMade: number;
  patientDiversitySwapsMade: number;
  patientRepairBlockedEmployees: number;
  patientBelowMinimum: number;
  patientAboveMaximum: number;
  patientMissingGi: number;
  patientMissingAllergy: number;
  patientMissingPcp: number;
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

export async function getScheduleRangeGenerationPreview(input: {
  startDate: string;
  endDate: string;
}) {
  const days = await getDb().scheduleDay.findMany({
    where: {
      date: {
        gte: parseIsoDate(input.startDate),
        lte: parseIsoDate(input.endDate),
      },
    },
    orderBy: { date: "asc" },
    select: {
      date: true,
      status: true,
      shiftBlocks: {
        where: { active: true },
        select: { id: true },
        take: 1,
      },
      taskSlots: {
        where: { status: { not: TaskSlotStatus.CANCELLED } },
        select: { id: true },
        take: 1,
      },
    },
  });

  return {
    generatedDraftDates: days
      .filter(
        (day) =>
          day.status !== "PUBLISHED" &&
          (day.status === "GENERATED" ||
            day.status === "NEEDS_REGENERATION" ||
            day.status === "LOCKED" ||
            day.shiftBlocks.length > 0 ||
            day.taskSlots.length > 0),
      )
      .map((day) => toIsoDate(day.date)),
    publishedDates: days
      .filter((day) => day.status === "PUBLISHED")
      .map((day) => toIsoDate(day.date)),
  };
}

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
  const generationPlan = planScheduleGeneration({
    startDate: input.startDate,
    endDate: input.endDate,
    publishedDates,
    overwritePublished: input.overwritePublished,
  });
  const summary: BulkGenerationSummary = {
    startDate: input.startDate,
    endDate: input.endDate,
    generationScope: "FULL",
    weeklyValidationPartial: false,
    partialWeekStarts: [],
    validationMessage: null,
    datesProcessed: 0,
    datesGenerated: 0,
    weeksProcessed: 0,
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
    saturdayIssues: 0,
    unmatchedTargetIssues: 0,
    weekSummaries: [],
    datesNeedingManualReview: [],
    generationDiagnostics: [],
    skippedClosedDates: [],
    skippedSundays: [],
    publishedDatesSkipped: [],
    publishedDatesOverwritten: [],
    backgroundSlotsCreated: 0,
    backgroundTopOffSlotsCreated: 0,
    backgroundTopOffAssignmentsCreated: 0,
    backgroundRoleMixSwapsMade: 0,
    backgroundTopOffIncompleteEmployees: 0,
    patientRangeSwapsMade: 0,
    patientDiversitySwapsMade: 0,
    patientRepairBlockedEmployees: 0,
    patientBelowMinimum: 0,
    patientAboveMaximum: 0,
    patientMissingGi: 0,
    patientMissingAllergy: 0,
    patientMissingPcp: 0,
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
  const {
    datesToGenerate,
    skippedSundays,
    publishedDatesSkipped,
    publishedDatesOverwritten,
    weeks: plannedWeeks,
    generationWeeks,
  } = generationPlan;
  summary.skippedSundays = skippedSundays;
  summary.publishedDatesSkipped = publishedDatesSkipped;
  summary.publishedDatesOverwritten = publishedDatesOverwritten;
  summary.partialWeekStarts = partialGenerationWeekStarts({
    weeks: plannedWeeks,
    publishedDatesSkipped,
  });
  summary.weeklyValidationPartial = summary.partialWeekStarts.length > 0;
  summary.generationScope = summary.weeklyValidationPartial
    ? "PARTIAL"
    : "FULL";
  summary.validationMessage = summary.weeklyValidationPartial
    ? "Weekly validation is partial because published days were skipped."
    : null;

  const beforeBoards = new Map(
    await Promise.all(
      datesToGenerate.map(async (date) => [date, await getScheduleBoard(date)] as const),
    ),
  );

  if (datesToGenerate.length > 0) {
    await clearGeneratedAssignmentsForRange(datesToGenerate);
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
  const topOffSummariesByWeekStart = new Map<
    string,
    Awaited<ReturnType<typeof topOffBackgroundAssignmentsForRange>>
  >();
  summary.weeksProcessed = plannedWeeks.length;

  for (const week of generationWeeks) {
    const saturdayDates = week.dates.filter(
      (date) => parseIsoDate(date).getUTCDay() === 6,
    );
    const nonSaturdayDates = week.dates.filter(
      (date) => parseIsoDate(date).getUTCDay() !== 6,
    );

    for (const date of saturdayDates) {
      const result = await generateScheduleForDate({
        date,
        seed: `${input.seedPrefix}:${date}`,
        actorEmployeeId: input.actorEmployeeId,
      });
      generationResults.set(date, result);
    }

    if (saturdayDates.length > 0) {
      const saturdayRepairSummary = await enforceWorkPatternRequirementsForRange({
        startDate: week.startDate,
        endDate: week.endDate,
        allowedDates: saturdayDates,
        mode: "SATURDAY_ONLY",
        actorEmployeeId: input.actorEmployeeId,
      });
      summary.workPatternTopOffSlotsCreated += saturdayRepairSummary.slotsCreated;
      summary.workPatternAssignmentsCreated +=
        saturdayRepairSummary.assignmentsCreated;
      summary.workPatternSwapsMade += saturdayRepairSummary.swapsMade;
      summary.workPatternUnresolved += saturdayRepairSummary.unresolved.length;
    }

    for (const date of nonSaturdayDates) {
      const result = await generateScheduleForDate({
        date,
        seed: `${input.seedPrefix}:${date}`,
        actorEmployeeId: input.actorEmployeeId,
      });
      generationResults.set(date, result);
    }

    const workPatternSummary = await enforceWorkPatternRequirementsForRange({
      startDate: week.startDate,
      endDate: week.endDate,
      allowedDates: week.dates,
      actorEmployeeId: input.actorEmployeeId,
    });
    summary.workPatternTopOffSlotsCreated += workPatternSummary.slotsCreated;
    summary.workPatternAssignmentsCreated +=
      workPatternSummary.assignmentsCreated;
    summary.workPatternSwapsMade += workPatternSummary.swapsMade;
    summary.workPatternUnresolved += workPatternSummary.unresolved.length;

    const topOffSummary = await topOffBackgroundAssignmentsForRange({
      startDate: week.startDate,
      endDate: week.endDate,
      allowedDates: week.dates,
      actorEmployeeId: input.actorEmployeeId,
    });
    topOffSummariesByWeekStart.set(week.startDate, topOffSummary);

    summary.backgroundTopOffSlotsCreated += topOffSummary.slotsCreated;
    summary.backgroundTopOffAssignmentsCreated += topOffSummary.assignmentsCreated;
    summary.backgroundRoleMixSwapsMade += topOffSummary.roleMixSwapsMade;
    summary.backgroundTopOffIncompleteEmployees +=
      topOffSummary.employeesMissingBackground.length +
      topOffSummary.employeesUnderExpectedHours.length;
    summary.configurationWarnings.push(
      ...topOffSummary.configurationWarnings,
      ...topOffSummary.employeesMissingBackground.map(
        (employee) =>
          `${employee.employeeName} remains ${employee.assigned}/${employee.required} literal BG inside their weekly target: ${employee.reason}`,
      ),
    );

    const patientFairnessSummary = await repairPatientFairnessForRange({
      startDate: week.startDate,
      endDate: week.endDate,
      allowedDates: week.dates,
      actorEmployeeId: input.actorEmployeeId,
    });
    summary.patientRangeSwapsMade += patientFairnessSummary.rangeSwapsMade;
    summary.patientDiversitySwapsMade +=
      patientFairnessSummary.diversitySwapsMade;
    summary.patientRepairBlockedEmployees +=
      patientFairnessSummary.diagnostics.filter(
        (diagnostic) => diagnostic.repairState === "BLOCKED",
      ).length;
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

  const hardRequirementSummary = await getRangeWeeklyHardRequirementSummary({
    startDate: input.startDate,
    endDate: input.endDate,
  });
  const partialWeekStarts = new Set(summary.partialWeekStarts);
  const fullyValidatedRequirementWeeks = hardRequirementSummary.weeks.filter(
    (week) => !partialWeekStarts.has(week.range.startDate),
  );
  summary.weekSummaries = buildMonthGenerationWeekSummaries({
    plannedWeeks,
    beforeBoards,
    publishedDatesSkipped: summary.publishedDatesSkipped,
    hardRequirementWeeks: hardRequirementSummary.weeks,
    topOffSummariesByWeekStart,
  });
  summary.employeesUnderTarget = summary.weekSummaries.reduce(
    (count, week) => count + week.employeesUnderTarget.length,
    0,
  );
  summary.employeesOverTarget = hardRequirementSummary.weeks.reduce(
    (count, week) =>
      partialWeekStarts.has(week.range.startDate)
        ? count
        : count +
          week.summary.employeeDiagnostics.filter(
            (diagnostic) =>
              diagnostic.workPattern.totalHours >
              diagnostic.workPattern.expectedHours,
          ).length,
    0,
  );
  const fullyValidatedIssues = fullyValidatedRequirementWeeks.flatMap(
    (week) => week.summary.issues,
  );
  summary.hardRequirementIssues = fullyValidatedIssues.length;
  summary.bgMinimumIssues = fullyValidatedRequirementWeeks.reduce(
    (count, week) => count + week.summary.bgMinimumIssues.length,
    0,
  );
  summary.workPatternIssues = fullyValidatedRequirementWeeks.reduce(
    (count, week) => count + week.summary.workPatternIssues.length,
    0,
  );
  summary.saturdayIssues = fullyValidatedIssues.filter(
    (issue) => issue.code === "SATURDAY_PATTERN_UNMET",
  ).length;
  summary.unmatchedTargetIssues = fullyValidatedRequirementWeeks.reduce(
    (count, week) => count + week.summary.unmatchedTargetIssues.length,
    0,
  );
  summary.patientBelowMinimum = fullyValidatedRequirementWeeks.reduce(
    (count, week) => count + week.summary.patientSummary.belowMinimum,
    0,
  );
  summary.patientAboveMaximum = fullyValidatedRequirementWeeks.reduce(
    (count, week) => count + week.summary.patientSummary.aboveMaximum,
    0,
  );
  summary.patientMissingGi = fullyValidatedRequirementWeeks.reduce(
    (count, week) => count + week.summary.patientSummary.missingGi,
    0,
  );
  summary.patientMissingAllergy = fullyValidatedRequirementWeeks.reduce(
    (count, week) => count + week.summary.patientSummary.missingAllergy,
    0,
  );
  summary.patientMissingPcp = fullyValidatedRequirementWeeks.reduce(
    (count, week) => count + week.summary.patientSummary.missingPcp,
    0,
  );
  const workPatternDiagnostics = fullyValidatedRequirementWeeks
    .flatMap((week) => week.summary.employeeDiagnostics)
    .filter(
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

  if (fullyValidatedIssues.length > 0) {
    const fullyValidatedDates = plannedWeeks
      .filter((week) => !partialWeekStarts.has(week.startDate))
      .flatMap((week) => week.dates);
    summary.datesNeedingManualReview = [
      ...new Set([
        ...summary.datesNeedingManualReview,
        ...fullyValidatedDates,
      ]),
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

export type FullScheduleRegenerationSummary = {
  stage: "COMPLETE";
  unpublish: Awaited<ReturnType<typeof unpublishScheduleRange>>;
  clear: ClearGeneratedScheduleSummary;
  generation: BulkGenerationSummary;
};

export class FullScheduleRegenerationError extends Error {
  constructor(
    public readonly stage: "UNPUBLISH" | "CLEAR" | "GENERATE",
    cause: unknown,
  ) {
    super(
      `Full regeneration failed during ${stage.toLowerCase()}: ${
        cause instanceof Error ? cause.message : "Unknown error"
      }`,
      { cause },
    );
    this.name = "FullScheduleRegenerationError";
  }
}

export async function regenerateFullScheduleRange(input: {
  startDate: string;
  endDate: string;
  seedPrefix: string;
  actorEmployeeId?: string | null;
}): Promise<FullScheduleRegenerationSummary> {
  let unpublish: Awaited<ReturnType<typeof unpublishScheduleRange>>;

  try {
    unpublish = await unpublishScheduleRange(input);
  } catch (error) {
    throw new FullScheduleRegenerationError("UNPUBLISH", error);
  }

  let clear: ClearGeneratedScheduleSummary;

  try {
    clear = await clearGeneratedScheduleRange({
      ...input,
      includePublished: false,
    });
  } catch (error) {
    throw new FullScheduleRegenerationError("CLEAR", error);
  }

  let generation: BulkGenerationSummary;

  try {
    generation = await generateScheduleRange({
      ...input,
      overwritePublished: false,
    });
  } catch (error) {
    throw new FullScheduleRegenerationError("GENERATE", error);
  }

  const summary = {
    stage: "COMPLETE" as const,
    unpublish,
    clear,
    generation,
  };

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "schedule.full_range_regenerate",
    entityType: "ScheduleRange",
    entityId: `${input.startDate}:${input.endDate}`,
    after: summary,
  });

  return summary;
}

async function clearGeneratedAssignmentsForRange(dates: string[]) {
  if (dates.length === 0) {
    return;
  }

  await getDb().assignment.updateMany({
    where: {
      status: "ACTIVE",
      locked: false,
      source: {
        in: [
          AssignmentSource.GENERATED,
          AssignmentSource.COVERAGE_REPLACEMENT,
        ],
      },
      taskSlot: {
        scheduleDay: {
          date: {
            in: dates.map(parseIsoDate),
          },
        },
        OR: [
          { backgroundTaskInstanceId: null },
          {
            backgroundTaskInstance: {
              definition: { protectedFromPull: false },
            },
          },
        ],
      },
    },
    data: {
      status: AssignmentStatus.REMOVED,
      removedAt: new Date(),
    },
  });
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
  const hardRequirements = await getRangeWeeklyHardRequirementSummary({
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
  EMPLOYEE_BG_MINIMUM_SOURCE,
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
            OR: [
              { locked: true },
              { source: AssignmentSource.MANUAL_OVERRIDE },
            ],
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
    patientRepairDiagnostics,
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
      where: { status: "ACTIVE", scheduleEligible: true },
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
    getPatientFairnessRepairDiagnosticsForRange(range),
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
          isPatientFacing: isJulyPatientShiftTaskType(slot.taskType),
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
  const patientRepairDiagnosticsByEmployeeId = new Map(
    patientRepairDiagnostics.map((diagnostic) => [
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
    const patientRepairDiagnostic =
      patientRepairDiagnosticsByEmployeeId.get(row.employeeId);

    return {
      ...row,
      workPatternLabel: target?.workPatternCode
        ? workPatternLabels.get(target.workPatternCode) ?? target.workPatternCode
        : null,
      activeTargetSheetName: target?.activeTargetSheetName ?? null,
      scheduleEligibility: target?.scheduleEligibility ?? "ACTIVE_SCHEDULED",
      scheduleEligibilityReason: target?.scheduleEligibilityReason ?? null,
      targetTaskCounts: target?.targetTaskCounts ?? {},
      requiredBackgroundAssignments:
        target?.requiredBackgroundAssignments ?? 0,
      missingBackgroundAssignments:
        diagnostic?.missingBackgroundAssignments ?? 0,
      bgMinimumSatisfiedInsideTargetHours:
        (target?.requiredBackgroundAssignments ?? 0) === 0 ||
        ((diagnostic?.missingBackgroundAssignments ?? 0) === 0 &&
          row.totalHours <= row.targetHours),
      bgMinimumInsideTargetStatus:
        (target?.requiredBackgroundAssignments ?? 0) === 0
          ? ("NOT_REQUIRED" as const)
          : (diagnostic?.missingBackgroundAssignments ?? 0) > 0
            ? ("MISSING_BG" as const)
            : row.totalHours > row.targetHours
              ? ("MET_OVER_TARGET" as const)
              : ("MET_INSIDE_TARGET" as const),
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
      patientRangeStatus:
        diagnostic?.patientFairness.rangeStatus ?? "WITHIN_RANGE",
      missingPatientExposureGroups:
        diagnostic?.patientFairness.missingExposureGroups ?? [],
      patientRepairAttempted:
        patientRepairDiagnostic?.repairAttempted ?? false,
      patientRepairState:
        patientRepairDiagnostic?.repairState ?? "NOT_NEEDED",
      patientRepairBlocker: patientRepairDiagnostic?.blocker ?? null,
    };
  });

  return {
    range,
    backgroundDefinitionCount,
    backgroundStaffingRuleCount,
    hardRequirements,
    patientFairnessSummary: hardRequirements.patientSummary,
    patientDiversityWarnings: hardRequirements.patientDiversityWarnings,
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
  const [
    scheduleDays,
    ptoRequests,
    nptoRequests,
    hardRequirements,
    configurationWarnings,
  ] =
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
              taskType: { select: { name: true, isBackground: true } },
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
      getRangeWeeklyHardRequirementSummary({
        startDate: range.gridStartDate,
        endDate: range.gridEndDate,
      }),
      getGenerationConfigurationWarnings(),
    ]);
  const scheduleDaysByDate = new Map(
    scheduleDays.map((day) => [toIsoDate(day.date), day]),
  );
  const hardRequirementsByWeekStart = new Map(
    hardRequirements.weeks.map((week) => [
      week.range.startDate,
      week.summary,
    ]),
  );
  const calendarDays = enumerateIsoDates(
    range.gridStartDate,
    range.gridEndDate,
  ).map((date) => {
    const scheduleDay = scheduleDaysByDate.get(date);
    const publishIssues = scheduleDay
      ? getSchedulePublishIssues(scheduleDay)
      : [];
    const weekHardRequirements = hardRequirementsByWeekStart.get(
      clinicWeekRange(date).startDate,
    );
    const inMonth = date >= range.monthStartDate && date <= range.monthEndDate;
    const isSunday = parseIsoDate(date).getUTCDay() === 0;
    const taskSlots = scheduleDay?.taskSlots ?? [];
    const clinicSlots = taskSlots.filter(
      (slot) => !slot.taskType.isBackground,
    );
    const filledClinicSlotCount = clinicSlots.filter(
      (slot) => slot.assignments.length >= slot.requiredStaff,
    ).length;
    const unfilledClinicSlotCount =
      clinicSlots.length - filledClinicSlotCount;
    const backgroundSlotCount = taskSlots.filter(
      (slot) => slot.taskType.isBackground,
    ).length;
    const requiredShortageCount = taskSlots.filter(
      (slot) =>
        slot.requirementLevel === "REQUIRED" &&
        slot.assignments.length < slot.requiredStaff,
    ).length;
    const hardRequirementCount = weekHardRequirements?.issues.length ?? 0;
    const presentation = getMonthDayPresentation({
      inMonth,
      isSunday,
      scheduleStatus: scheduleDay?.status,
      hasGeneratedContent: Boolean(
        scheduleDay &&
          (scheduleDay.shiftBlocks.length > 0 || scheduleDay.taskSlots.length > 0),
      ),
      publishIssueCount: publishIssues.length,
      hardRequirementCount,
      requiredShortageCount,
    });

    return {
      date,
      inMonth,
      isSunday,
      status: scheduleDay?.status ?? ("NOT_GENERATED" as const),
      scenario: scheduleDay?.scenario ?? null,
      shiftBlockCount: scheduleDay?.shiftBlocks.length ?? 0,
      taskSlotCount: taskSlots.length,
      assignmentCount:
        taskSlots.reduce(
          (count, slot) => count + slot.assignments.length,
          0,
        ),
      filledClinicSlotCount,
      unfilledClinicSlotCount,
      backgroundSlotCount,
      shortageCount:
        taskSlots.filter((slot) => slot.status === "SHORTAGE").length,
      unfilledRequiredCount: requiredShortageCount,
      requiredShortageCount,
      hardRequirementCount,
      hardRequirementMessages:
        weekHardRequirements?.issues.slice(0, 3).map((issue) => issue.message) ??
        [],
      publishIssueCount: publishIssues.length,
      ptoCount: countRequestsOnDate(date, ptoRequests),
      nptoCount: countRequestsOnDate(date, nptoRequests),
      publishStatus:
        scheduleDay?.status === "PUBLISHED"
          ? ("PUBLISHED" as const)
          : scheduleDay
            ? ("DRAFT" as const)
            : ("NOT_GENERATED" as const),
      ...presentation,
      canPublish: Boolean(
        scheduleDay &&
          scheduleDay.status !== "PUBLISHED" &&
          publishIssues.length === 0,
      ),
      canUnpublish: scheduleDay?.status === "PUBLISHED",
    };
  });
  const inMonthDays = calendarDays.filter((day) => day.inMonth);

  return {
    range,
    configurationWarnings,
    monthSummary: {
      notGenerated: inMonthDays.filter(
        (day) =>
          !day.isSunday &&
          day.shiftBlockCount === 0 &&
          day.taskSlotCount === 0,
      ).length,
      generatedDraft: inMonthDays.filter(
        (day) =>
          day.status !== "PUBLISHED" &&
          (day.shiftBlockCount > 0 || day.taskSlotCount > 0),
      ).length,
      published: inMonthDays.filter(
        (day) => day.status === "PUBLISHED",
      ).length,
      needsReview: inMonthDays.filter(
        (day) => day.displayStatus === "NEEDS_REVIEW",
      ).length,
      hardRequirementsUnmet: inMonthDays.filter(
        (day) => day.displayStatus === "HARD_REQUIREMENTS_UNMET",
      ).length,
      notScheduled: inMonthDays.filter(
        (day) => day.displayStatus === "NOT_SCHEDULED",
      ).length,
    },
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

function buildMonthGenerationWeekSummaries(input: {
  plannedWeeks: ReturnType<typeof groupScheduleDatesByClinicWeek>;
  beforeBoards: Map<string, Awaited<ReturnType<typeof getScheduleBoard>>>;
  publishedDatesSkipped: string[];
  hardRequirementWeeks: Awaited<
    ReturnType<typeof getRangeWeeklyHardRequirementSummary>
  >["weeks"];
  topOffSummariesByWeekStart: Map<
    string,
    Awaited<ReturnType<typeof topOffBackgroundAssignmentsForRange>>
  >;
}) {
  const hardRequirementsByWeekStart = new Map(
    input.hardRequirementWeeks.map((week) => [week.range.startDate, week.summary]),
  );
  const publishedDatesSkipped = new Set(input.publishedDatesSkipped);

  return input.plannedWeeks.map((week) => {
    const hardRequirements = hardRequirementsByWeekStart.get(week.startDate);
    const topOffSummary = input.topOffSummariesByWeekStart.get(week.startDate);
    const skippedPublishedCount = week.dates.filter((date) =>
      publishedDatesSkipped.has(date),
    ).length;
    const validationStatus =
      skippedPublishedCount > 0 ? ("PARTIAL" as const) : ("FULL" as const);
    const exactTopOffReasons = new Map<string, string>();

    for (const employee of topOffSummary?.employeesUnderExpectedHours ?? []) {
      exactTopOffReasons.set(employee.employeeId, employee.reason);
    }

    for (const employee of topOffSummary?.employeesMissingBackground ?? []) {
      exactTopOffReasons.set(
        employee.employeeId,
        `${employee.employeeName} remains ${employee.assigned}/${employee.required} literal BG inside their weekly target: ${employee.reason}`,
      );
    }
    const issuesByEmployeeId = new Map<string, string[]>();

    for (const issue of hardRequirements?.issues ?? []) {
      if (!issue.employeeId || issue.code === "BELOW_EXPECTED_HOURS") {
        continue;
      }

      const issues = issuesByEmployeeId.get(issue.employeeId) ?? [];
      issues.push(issue.message);
      issuesByEmployeeId.set(issue.employeeId, issues);
    }

    const employeesUnderTarget =
      validationStatus === "PARTIAL"
        ? []
        : hardRequirements?.employeeDiagnostics
        .filter(
          (diagnostic) =>
            diagnostic.workPattern.totalHours <
            diagnostic.workPattern.expectedHours,
        )
        .map((diagnostic) => {
          const blockers = issuesByEmployeeId.get(diagnostic.employeeId) ?? [];
          const exactReason = exactTopOffReasons.get(diagnostic.employeeId);

          if (exactReason && !blockers.includes(exactReason)) {
            blockers.push(exactReason);
          }

          return {
            employeeId: diagnostic.employeeId,
            employeeName: diagnostic.employeeName,
            scheduledHours: diagnostic.workPattern.totalHours,
            targetHours: diagnostic.workPattern.expectedHours,
            blockers,
          };
        }) ?? [];

    return {
      startDate: week.startDate,
      endDate: week.endDate,
      validationStatus,
      validationMessage:
        validationStatus === "PARTIAL"
          ? "Weekly validation is partial because published days were skipped."
          : null,
      daysProcessed: week.dates.filter(
        (date) => !publishedDatesSkipped.has(date),
      ).length,
      daysCreated: week.dates.filter(
        (date) =>
          !publishedDatesSkipped.has(date) && !input.beforeBoards.get(date),
      ).length,
      daysRegenerated: week.dates.filter(
        (date) =>
          !publishedDatesSkipped.has(date) && Boolean(input.beforeBoards.get(date)),
      ).length,
      daysSkippedPublished: skippedPublishedCount,
      employeesUnderTarget,
      hardRequirementIssues:
        validationStatus === "PARTIAL"
          ? 0
          : hardRequirements?.issues.length ?? 0,
      bgMinimumIssues:
        validationStatus === "PARTIAL"
          ? 0
          : hardRequirements?.bgMinimumIssues.length ?? 0,
      workPatternIssues:
        validationStatus === "PARTIAL"
          ? 0
          : hardRequirements?.workPatternIssues.length ?? 0,
      saturdayIssues:
        validationStatus === "PARTIAL"
          ? 0
          : hardRequirements?.issues.filter(
              (issue) => issue.code === "SATURDAY_PATTERN_UNMET",
            ).length ?? 0,
    } satisfies MonthGenerationWeekSummary;
  });
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
