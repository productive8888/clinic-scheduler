import { createHash } from "node:crypto";
import {
  AssignmentSource,
  AssignmentStatus,
  type ClinicScenario,
  Prisma,
  type ShiftBlock,
  TaskSlotStatus,
} from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { selectBackgroundPullCandidates } from "@/lib/background/pull-priority";
import { getDb } from "@/lib/db";
import {
  getManualAssignmentWarningMatrix,
  getManualAssignmentWarnings,
} from "@/lib/db/manual-assignment";
import {
  generateSchedule,
  isUnavailableForSlot,
  SCHEDULER_ENGINE_VERSION,
  type ExistingAssignment,
  type SchedulerEmployee,
  type SchedulerTaskSlot,
  type SchedulerTaskType,
} from "@/lib/scheduler";
import {
  getConstraintRejections,
  hasRequiredSkills,
  overlaps,
} from "@/lib/scheduler/constraints";
import { isShortNoticeScheduleChange } from "@/lib/schedule/short-notice";
import { buildJulySaturdayReservationPlan } from "@/lib/schedule/july-saturday-reservations";
import { buildJulyWeekSkeletons } from "@/lib/schedule/july-week-planner";
import { patternPreferredEmployeeIdsForSlot } from "@/lib/schedule/pattern-preferences";
import {
  isJulyPatientShiftTaskType,
  julyPatientShiftGroupFromTaskCode,
} from "@/lib/schedule/patient-shifts";
import { getSchedulePublishIssues } from "@/lib/schedule/publish-validation";
import { clinicWeekRange } from "@/lib/schedule/range";
import { getWeeklyHardRequirementSummary } from "@/lib/db/weekly-hard-requirements";
import { findEastonTargetForEmployee } from "@/lib/easton-import/employee-targets";
import {
  getEffectiveRequiredBackgroundAssignments,
  getEffectiveWeeklyTargetHours,
  getEffectiveWorkPattern,
} from "@/lib/schedule/easton-work-pattern-resolution";
import { withEastonDerivedAvailability } from "@/lib/schedule/easton-derived-availability";
import { eastonTargetPatternCodeForDate } from "@/lib/schedule/easton-model";
import { isSchedulingRequiredEmployee } from "@/lib/schedule/employees";
import { isCanonicalBgTaskType } from "@/lib/schedule/bg-role";
import {
  EMPLOYEE_BG_MINIMUM_SOURCE,
  isEmployeeBgMinimumSlotSource,
} from "@/lib/schedule/employee-bg-minimum";
import { shouldPreserveSlotOutsideStaffingRequirements } from "@/lib/schedule/slot-reconciliation";
import { buildShiftBlockSnapshot } from "@/lib/shifts/templates";
import { LEGACY_SHIFT_TEMPLATE_ID } from "@/lib/shifts/legacy";
import {
  selectStaffingSlotSpecs,
  type StaffingSlotSpec,
} from "@/lib/staffing/requirements";
import { selectShortageRecommendations } from "@/lib/shortage/recommendations";
import { addDaysIsoDate, parseIsoDate, toIsoDate } from "@/lib/utils/date";

export async function getScheduleBoard(date: string) {
  return getDb().scheduleDay.findUnique({
    where: { date: parseIsoDate(date) },
    include: {
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
          taskType: {
            include: {
              skillRequirements: {
                include: { skill: true },
              },
            },
          },
          backgroundTaskInstance: {
            include: {
              definition: {
                include: {
                  requiredSkills: true,
                  eligibleEmployees: true,
                },
              },
            },
          },
          assignments: {
            where: { status: "ACTIVE" },
            include: { employee: true },
            orderBy: { assignedAt: "desc" },
          },
        },
      },
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
      publishedBy: true,
    },
  });
}

export async function getSchedulePageData(date: string) {
  const [scheduleDay, employees, taskTypes, manualWarnings, legacySlotCount] =
    await Promise.all([
    getScheduleBoard(date),
    getDb().employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    getDb().taskType.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { skillRequirements: { include: { skill: true } } },
    }),
    getManualAssignmentWarningMatrix(date),
    getDb().taskSlot.count({
      where: {
        scheduleDay: { date: parseIsoDate(date) },
        status: { not: "CANCELLED" },
        shiftBlock: {
          OR: [
            { source: { in: ["MIGRATION", "FALLBACK"] } },
            { shiftTemplateId: LEGACY_SHIFT_TEMPLATE_ID },
          ],
        },
      },
    }),
  ]);

  return { scheduleDay, employees, taskTypes, manualWarnings, legacySlotCount };
}

export async function ensureScheduleDayWithDefaultSlots(
  date: string,
  actorEmployeeId?: string | null,
  scenario?: ClinicScenario,
) {
  const db = getDb();
  const dateValue = parseIsoDate(date);

  const scheduleDay = await db.scheduleDay.upsert({
    where: { date: dateValue },
    update: scenario ? { scenario } : {},
    create: {
      date: dateValue,
      status: "DRAFT",
      scenario: scenario ?? "ROUTINE",
    },
  });

  const taskSlotCount = await reconcileSlotsForStaffingRequirements({
    scheduleDayId: scheduleDay.id,
    date,
    scenario: scheduleDay.scenario,
  });

  await writeAuditLog({
    actorEmployeeId,
    action: "schedule_day.ensure_default_slots",
    entityType: "ScheduleDay",
    entityId: scheduleDay.id,
    after: { date, scenario: scheduleDay.scenario, taskSlotCount },
  });

  return scheduleDay;
}

export async function setScheduleScenario(input: {
  date: string;
  scenario: ClinicScenario;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const changedAt = new Date();
  const dateValue = parseIsoDate(input.date);
  const shortNotice = isShortNoticeScheduleChange({
    changedAt,
    shiftDate: input.date,
  });

  const before = await db.scheduleDay.findUnique({
    where: { date: dateValue },
  });

  const scheduleDay = await db.scheduleDay.upsert({
    where: { date: dateValue },
    update: {
      scenario: input.scenario,
      status: before?.status === "PUBLISHED" ? "GENERATED" : undefined,
      publishedAt: null,
      publishedByEmployeeId: null,
    },
    create: {
      date: dateValue,
      scenario: input.scenario,
      status: "DRAFT",
    },
  });

  await reconcileSlotsForStaffingRequirements({
    scheduleDayId: scheduleDay.id,
    date: input.date,
    scenario: input.scenario,
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "schedule_day.set_scenario",
    entityType: "ScheduleDay",
    entityId: scheduleDay.id,
    before,
    after: scheduleDay,
    metadata: { shortNotice },
  });

  return scheduleDay;
}

export async function addTaskSlotToScheduleDay(input: {
  date: string;
  taskTypeId: string;
  shiftBlockId?: string | null;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const createdAt = new Date();
  const dateValue = parseIsoDate(input.date);
  const shortNotice = isShortNoticeScheduleChange({
    changedAt: createdAt,
    shiftDate: input.date,
  });

  const [scheduleDay, taskType] = await Promise.all([
    db.scheduleDay.upsert({
      where: { date: dateValue },
      update: {},
      create: {
        date: dateValue,
        status: "DRAFT",
        scenario: "CUSTOM",
      },
    }),
    db.taskType.findUniqueOrThrow({
      where: { id: input.taskTypeId },
    }),
  ]);

  const shiftBlocks = await ensureShiftBlocksForScheduleDay({
    scheduleDayId: scheduleDay.id,
    date: input.date,
    scenario: scheduleDay.scenario,
  });
  const selectedShiftBlock =
    shiftBlocks.find((shiftBlock) => shiftBlock.id === input.shiftBlockId) ??
    selectDefaultShiftBlock(shiftBlocks);

  if (!selectedShiftBlock) {
    throw new Error("No shift block is available for this date.");
  }

  const existing = await db.taskSlot.aggregate({
    where: {
      scheduleDayId: scheduleDay.id,
      shiftBlockId: selectedShiftBlock.id,
      taskTypeId: input.taskTypeId,
    },
    _max: { slotIndex: true },
  });
  const slotIndex = (existing._max.slotIndex ?? 0) + 1;

  const slot = await db.taskSlot.create({
    data: {
      scheduleDayId: scheduleDay.id,
      shiftBlockId: selectedShiftBlock.id,
      taskTypeId: input.taskTypeId,
      slotIndex,
      label: `${taskType.name} #${slotIndex}`,
      startMinute: selectedShiftBlock.startMinute,
      endMinute: selectedShiftBlock.endMinute,
      status: "OPEN",
      shortNotice,
      minStaff: 1,
      requiredStaff: 1,
      requirementLevel: "OPTIONAL",
      source: "MANUAL",
      createdAt,
    },
  });

  if (scheduleDay.status === "PUBLISHED") {
    await db.scheduleDay.update({
      where: { id: scheduleDay.id },
      data: {
        status: "GENERATED",
        publishedAt: null,
        publishedByEmployeeId: null,
      },
    });
  }

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "task_slot.add_manual",
    entityType: "TaskSlot",
    entityId: slot.id,
    after: {
      date: input.date,
      taskTypeId: input.taskTypeId,
      taskTypeCode: taskType.code,
      shiftBlockId: selectedShiftBlock.id,
      shiftBlockName: selectedShiftBlock.name,
      optional: taskType.optional,
      shortNotice,
    },
    metadata: { shortNotice },
  });

  return slot;
}

export async function manuallyAssignSlot(input: {
  slotId: string;
  employeeId: string | null;
  actorEmployeeId?: string | null;
  overrideReason?: string | null;
}) {
  const db = getDb();
  const changedAt = new Date();
  const slotState = await db.taskSlot.findUniqueOrThrow({
    where: { id: input.slotId },
    select: {
      scheduleDay: { select: { status: true } },
    },
  });

  if (
    slotState.scheduleDay.status === "PUBLISHED" &&
    !input.overrideReason?.trim()
  ) {
    throw new Error(
      "A manager reason is required to change a published schedule.",
    );
  }

  const warnings = await getManualAssignmentWarnings(input);

  if (warnings.length > 0 && !input.overrideReason?.trim()) {
    throw new Error(
      `Manual override reason required: ${warnings.map((warning) => warning.message).join(" ")}`,
    );
  }

  const result = await db.$transaction(async (tx) => {
    const slot = await tx.taskSlot.findUniqueOrThrow({
      where: { id: input.slotId },
      include: {
        scheduleDay: true,
        assignments: {
          where: { status: "ACTIVE" },
          include: { employee: true },
        },
      },
    });
    const shortNotice = isShortNoticeScheduleChange({
      changedAt,
      shiftDate: slot.scheduleDay.date,
    });

    await tx.assignment.updateMany({
      where: {
        taskSlotId: input.slotId,
        status: "ACTIVE",
      },
      data: {
        status: "REMOVED",
        removedAt: new Date(),
      },
    });

    const assignment = input.employeeId
      ? await tx.assignment.create({
          data: {
            taskSlotId: input.slotId,
            employeeId: input.employeeId,
            source: "MANUAL_OVERRIDE",
            locked: true,
            shortNotice,
            assignedByEmployeeId: input.actorEmployeeId ?? undefined,
            assignedAt: changedAt,
            notes: input.overrideReason?.trim() || undefined,
          },
        })
      : null;

    await tx.taskSlot.update({
      where: { id: input.slotId },
      data: {
        status: input.employeeId ? "FILLED" : "OPEN",
        shortNotice: slot.shortNotice || shortNotice,
        notes: null,
      },
    });

    await tx.scheduleDay.update({
      where: { id: slot.scheduleDayId },
      data: {
        status:
          slot.scheduleDay.status === "PUBLISHED" ? "PUBLISHED" : "GENERATED",
        updatedAt: changedAt,
      },
    });

    return {
      slot,
      assignment,
      before: slot.assignments.map((existing) => ({
        assignmentId: existing.id,
        employeeId: existing.employeeId,
      })),
      shortNotice,
    };
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: input.employeeId ? "assignment.manual_override" : "assignment.clear",
    entityType: "TaskSlot",
    entityId: input.slotId,
    before: result.before,
    after: result.assignment
      ? {
          assignmentId: result.assignment.id,
        employeeId: result.assignment.employeeId,
        shortNotice: result.assignment.shortNotice,
      }
      : null,
    metadata: {
      shortNotice: result.shortNotice,
      overrideReason: input.overrideReason?.trim() || null,
      warnings,
      publishedChange: slotState.scheduleDay.status === "PUBLISHED",
    },
  });
}

export async function manuallyAssignSlots(input: {
  slotIds: string[];
  employeeId: string;
  actorEmployeeId?: string | null;
  overrideReason?: string | null;
}) {
  const slotIds = [...new Set(input.slotIds)].sort();
  const warningsBySlot = new Map<string, Awaited<ReturnType<typeof getManualAssignmentWarnings>>>();
  const selectedSlots = await getDb().taskSlot.findMany({
    where: { id: { in: slotIds } },
    select: {
      id: true,
      startMinute: true,
      endMinute: true,
      scheduleDay: { select: { date: true } },
      shiftBlock: { select: { startMinute: true, endMinute: true } },
    },
    orderBy: { id: "asc" },
  });
  const selectedOverlapWarnings: string[] = [];

  for (let left = 0; left < selectedSlots.length; left += 1) {
    for (let right = left + 1; right < selectedSlots.length; right += 1) {
      const leftSlot = selectedSlots[left];
      const rightSlot = selectedSlots[right];

      if (
        leftSlot.scheduleDay.date.getTime() === rightSlot.scheduleDay.date.getTime() &&
        overlaps(
          leftSlot.startMinute ?? leftSlot.shiftBlock.startMinute,
          leftSlot.endMinute ?? leftSlot.shiftBlock.endMinute,
          rightSlot.startMinute ?? rightSlot.shiftBlock.startMinute,
          rightSlot.endMinute ?? rightSlot.shiftBlock.endMinute,
        )
      ) {
        selectedOverlapWarnings.push(
          `Selected slots ${leftSlot.id} and ${rightSlot.id} overlap.`,
        );
      }
    }
  }

  for (const slotId of slotIds) {
    warningsBySlot.set(
      slotId,
      await getManualAssignmentWarnings({
        slotId,
        employeeId: input.employeeId,
      }),
    );
  }

  const warningCount =
    selectedOverlapWarnings.length +
    [...warningsBySlot.values()].reduce(
      (count, warnings) => count + warnings.length,
      0,
    );

  if (warningCount > 0 && !input.overrideReason?.trim()) {
    throw new Error("Review the multi-shift warnings and provide an override reason.");
  }

  for (const slotId of slotIds) {
    await manuallyAssignSlot({
      slotId,
      employeeId: input.employeeId,
      actorEmployeeId: input.actorEmployeeId,
      overrideReason: input.overrideReason,
    });
  }

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "assignment.multi_shift_override",
    entityType: "TaskSlot",
    entityId: slotIds.join(","),
    after: {
      employeeId: input.employeeId,
      slotIds,
      warningCount,
      selectedOverlapWarnings,
      overrideReason: input.overrideReason?.trim() || null,
    },
  });

  return { slotIds, warningCount };
}

export async function copyScheduleDayAssignments(input: {
  sourceDate: string;
  targetDate: string;
  actorEmployeeId?: string | null;
  overrideReason?: string | null;
}) {
  await ensureScheduleDayWithDefaultSlots(input.targetDate, input.actorEmployeeId);
  const [source, target] = await Promise.all([
    getScheduleBoard(input.sourceDate),
    getScheduleBoard(input.targetDate),
  ]);

  if (!source || !target) {
    throw new Error("Both source and target schedule days must exist.");
  }

  if (target.status === "PUBLISHED") {
    throw new Error("Unpublish the target date before copying assignments.");
  }

  const mappings = source.taskSlots.flatMap((sourceSlot) => {
    const assignment = sourceSlot.assignments[0];
    if (!assignment) {
      return [];
    }

    const targetSlot =
      target.taskSlots.find(
        (slot) =>
          slot.taskTypeId === sourceSlot.taskTypeId &&
          slot.slotIndex === sourceSlot.slotIndex &&
          slot.shiftBlock.shiftTemplateId === sourceSlot.shiftBlock.shiftTemplateId,
      ) ??
      target.taskSlots.find(
        (slot) =>
          slot.taskTypeId === sourceSlot.taskTypeId &&
          slot.slotIndex === sourceSlot.slotIndex &&
          slot.shiftBlock.shiftCategory === sourceSlot.shiftBlock.shiftCategory,
      );

    return targetSlot
      ? [{ slotId: targetSlot.id, employeeId: assignment.employeeId }]
      : [];
  });
  const warnings = [];

  for (const mapping of mappings) {
    warnings.push(
      ...(await getManualAssignmentWarnings({
        slotId: mapping.slotId,
        employeeId: mapping.employeeId,
      })),
    );
  }

  if (warnings.length > 0 && !input.overrideReason?.trim()) {
    throw new Error("Copied assignments have warnings. Provide an override reason.");
  }

  for (const mapping of mappings) {
    await manuallyAssignSlot({
      ...mapping,
      actorEmployeeId: input.actorEmployeeId,
      overrideReason: input.overrideReason,
    });
  }

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "assignment.copy_day_pattern",
    entityType: "ScheduleDay",
    entityId: target.id,
    after: {
      sourceDate: input.sourceDate,
      targetDate: input.targetDate,
      copiedAssignments: mappings.length,
      warningCount: warnings.length,
      overrideReason: input.overrideReason?.trim() || null,
    },
  });

  return { copiedAssignments: mappings.length, warningCount: warnings.length };
}

export async function generateScheduleForDate(input: {
  date: string;
  seed: string;
  actorEmployeeId?: string | null;
}) {
  await ensureScheduleDayWithDefaultSlots(input.date, input.actorEmployeeId);

  const fairnessSettingPromise = getDb().fairnessSetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
  const fairnessSetting = await fairnessSettingPromise;
  const fairnessWindow = getFairnessWindow(input.date, fairnessSetting);
  const currentWeek = clinicWeekRange(input.date);
  const eastonTargetPatternCode = eastonTargetPatternCodeForDate(input.date);
  const [
    scheduleDay,
    employees,
    historicalAssignments,
    rules,
    shortageRules,
    backgroundPullRules,
    patternSlots,
    previousWeekPatternSlots,
    scheduleTargets,
    weekScheduleDays,
    backgroundTaskType,
  ] = await Promise.all([
    getScheduleBoard(input.date),
    getDb().employee.findMany({
      where: { status: "ACTIVE", scheduleEligible: true },
      include: {
        skills: true,
        availability: { where: { active: true } },
        workPattern: true,
        ptoRequests: {
          where: {
            status: { in: ["APPROVED", "OVERRIDDEN"] },
            startDate: { lte: parseIsoDate(input.date) },
            endDate: { gte: parseIsoDate(input.date) },
          },
        },
        nptoRequests: {
          where: {
            status: { in: ["APPROVED", "OVERRIDDEN"] },
            startDate: { lte: parseIsoDate(input.date) },
            endDate: { gte: parseIsoDate(input.date) },
          },
        },
      },
      orderBy: { fullName: "asc" },
    }),
    getDb().assignment.findMany({
      where: {
        status: "ACTIVE",
        taskSlot: {
          scheduleDay: {
            OR: [
              {
                date: {
                  gte: parseIsoDate(fairnessWindow.startDate),
                  lt: parseIsoDate(input.date),
                },
              },
              {
                AND: [
                  { date: { gte: parseIsoDate(currentWeek.startDate) } },
                  { date: { lte: parseIsoDate(currentWeek.endDate) } },
                  { date: { not: parseIsoDate(input.date) } },
                ],
              },
            ],
          },
        },
      },
      include: {
        taskSlot: {
          include: {
            scheduleDay: true,
            shiftBlock: true,
            taskType: true,
          },
        },
      },
      orderBy: [{ employeeId: "asc" }, { taskSlotId: "asc" }, { id: "asc" }],
    }),
    getDb().schedulingRule.findMany({
      where: {
        active: true,
        AND: [
          {
            OR: [
              { effectiveStartDate: null },
              { effectiveStartDate: { lte: parseIsoDate(input.date) } },
            ],
          },
          {
            OR: [
              { effectiveEndDate: null },
              { effectiveEndDate: { gte: parseIsoDate(input.date) } },
            ],
          },
        ],
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    getDb().shortageRule.findMany({
      where: {
        active: true,
        AND: [
          {
            OR: [
              { effectiveStartDate: null },
              { effectiveStartDate: { lte: parseIsoDate(input.date) } },
            ],
          },
          {
            OR: [
              { effectiveEndDate: null },
              { effectiveEndDate: { gte: parseIsoDate(input.date) } },
            ],
          },
        ],
      },
      orderBy: [{ closurePriority: "asc" }, { updatedAt: "desc" }, { id: "asc" }],
    }),
    getDb().backgroundPullRule.findMany({
      where: { active: true },
      orderBy: [{ priorityRank: "asc" }, { employeeId: "asc" }],
    }),
    getDb().schedulePatternSlot.findMany({
      where: {
        weekday: parseIsoDate(input.date).getUTCDay(),
        pattern: {
          active: true,
          AND: [
            {
              OR: [
                { effectiveStartDate: null },
                { effectiveStartDate: { lte: parseIsoDate(input.date) } },
              ],
            },
            {
              OR: [
                { effectiveEndDate: null },
                { effectiveEndDate: { gte: parseIsoDate(input.date) } },
              ],
            },
          ],
        },
      },
      orderBy: [
        { weekday: "asc" },
        { slotIndex: "asc" },
        { id: "asc" },
      ],
    }),
    getPreviousPublishedWeekPatternSlots(input.date),
    getDb().employeeScheduleTarget.findMany({
      where: {
        scheduleEligibility: "ACTIVE_SCHEDULED",
        pattern: {
          code:
            eastonTargetPatternCode ??
            "__NO_ACTIVE_EASTON_TARGET_PATTERN__",
          active: true,
        },
      },
      orderBy: [{ employeeName: "asc" }, { id: "asc" }],
    }),
    getDb().scheduleDay.findMany({
      where: {
        date: {
          gte: parseIsoDate(currentWeek.startDate),
          lte: parseIsoDate(currentWeek.endDate),
        },
      },
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
          orderBy: [{ startMinute: "asc" }, { id: "asc" }],
        },
      },
      orderBy: { date: "asc" },
    }),
    getDb().taskType.findFirst({
      where: { active: true, code: "BACKGROUND" },
      include: {
        skillRequirements: {
          include: { skill: true },
        },
      },
    }),
  ]);

  if (!scheduleDay) {
    throw new Error("Schedule day was not created");
  }

  const taskTypes = new Map(
    scheduleDay.taskSlots.map((slot) => [
      slot.taskType.id,
      schedulerTaskTypeFromTaskType(slot.taskType),
    ]),
  );

  if (backgroundTaskType && !taskTypes.has(backgroundTaskType.id)) {
    taskTypes.set(
      backgroundTaskType.id,
      schedulerTaskTypeFromTaskType(backgroundTaskType),
    );
  }
  const taskTypeIdByCode = new Map(
    [...taskTypes.values()].map((taskType) => [taskType.code, taskType.id]),
  );

  const historicalCountByEmployee = new Map<string, number>();
  const historicalTaskCountByEmployee = new Map<string, Record<string, number>>();
  const historicalClinicalCountByEmployee = new Map<string, number>();
  const historicalPatientFacingCountByEmployee = new Map<string, number>();
  const historicalHoursByEmployee = new Map<string, number>();
  const historicalSaturdayCountByEmployee = new Map<string, number>();
  const historicalEndoscopyCountByEmployee = new Map<string, number>();
  const scheduledHoursThisWeekByEmployee = new Map<string, number>();
  const scheduledPatientFacingThisWeekByEmployee = new Map<string, number>();
  const scheduledExposureThisWeekByEmployee = new Map<
    string,
    Record<"GI" | "ALLERGY" | "PCP", number>
  >();
  const scheduledBackgroundAssignmentsThisWeekByEmployee = new Map<string, number>();
  const scheduledEarlyStartsThisWeekByEmployee = new Map<string, number>();
  const countedCurrentWeekShifts = new Set<string>();

  for (const assignment of historicalAssignments) {
    historicalCountByEmployee.set(
      assignment.employeeId,
      (historicalCountByEmployee.get(assignment.employeeId) ?? 0) + 1,
    );

    const taskCounts =
      historicalTaskCountByEmployee.get(assignment.employeeId) ?? {};
    taskCounts[assignment.taskSlot.taskTypeId] =
      (taskCounts[assignment.taskSlot.taskTypeId] ?? 0) + 1;
    historicalTaskCountByEmployee.set(assignment.employeeId, taskCounts);

    if (assignment.taskSlot.taskType.isClinical) {
      historicalClinicalCountByEmployee.set(
        assignment.employeeId,
        (historicalClinicalCountByEmployee.get(assignment.employeeId) ?? 0) + 1,
      );
    }

    if (isJulyPatientShiftTaskType(assignment.taskSlot.taskType)) {
      historicalPatientFacingCountByEmployee.set(
        assignment.employeeId,
        (historicalPatientFacingCountByEmployee.get(assignment.employeeId) ?? 0) + 1,
      );
    }

    historicalHoursByEmployee.set(
      assignment.employeeId,
      (historicalHoursByEmployee.get(assignment.employeeId) ?? 0) +
        Number(assignment.taskSlot.shiftBlock.paidHours),
    );

    if (
      assignment.taskSlot.shiftBlock.shiftCategory === "SATURDAY" ||
      assignment.taskSlot.scheduleDay.date.getUTCDay() === 6
    ) {
      historicalSaturdayCountByEmployee.set(
        assignment.employeeId,
        (historicalSaturdayCountByEmployee.get(assignment.employeeId) ?? 0) + 1,
      );
    }

    if (
      assignment.taskSlot.taskType.isEndoscopy ||
      assignment.taskSlot.shiftBlock.shiftCategory === "ENDO"
    ) {
      historicalEndoscopyCountByEmployee.set(
        assignment.employeeId,
        (historicalEndoscopyCountByEmployee.get(assignment.employeeId) ?? 0) + 1,
      );
    }

    const assignmentDate = toIsoDate(assignment.taskSlot.scheduleDay.date);
    const currentWeekShiftKey = `${assignment.employeeId}:${assignmentDate}:${assignment.taskSlot.shiftBlock.id}`;

    if (
      assignmentDate >= currentWeek.startDate &&
      assignmentDate <= currentWeek.endDate &&
      assignmentDate !== input.date
    ) {
      if (!countedCurrentWeekShifts.has(currentWeekShiftKey)) {
        countedCurrentWeekShifts.add(currentWeekShiftKey);
        scheduledHoursThisWeekByEmployee.set(
          assignment.employeeId,
          (scheduledHoursThisWeekByEmployee.get(assignment.employeeId) ?? 0) +
            Number(assignment.taskSlot.shiftBlock.paidHours),
        );

        if (assignment.taskSlot.shiftBlock.startMinute <= 7 * 60) {
          scheduledEarlyStartsThisWeekByEmployee.set(
            assignment.employeeId,
            (scheduledEarlyStartsThisWeekByEmployee.get(assignment.employeeId) ?? 0) +
              1,
          );
        }
      }

      if (isCanonicalBgTaskType(assignment.taskSlot.taskType)) {
        scheduledBackgroundAssignmentsThisWeekByEmployee.set(
          assignment.employeeId,
          (scheduledBackgroundAssignmentsThisWeekByEmployee.get(assignment.employeeId) ?? 0) +
            1,
        );
      }

      const exposureGroup = taskExposureGroup(
        assignment.taskSlot.taskType.code,
      );

      if (exposureGroup) {
        scheduledPatientFacingThisWeekByEmployee.set(
          assignment.employeeId,
          (scheduledPatientFacingThisWeekByEmployee.get(
            assignment.employeeId,
          ) ?? 0) + 1,
        );
        const exposure =
          scheduledExposureThisWeekByEmployee.get(assignment.employeeId) ?? {
            GI: 0,
            ALLERGY: 0,
            PCP: 0,
          };
        exposure[exposureGroup] += 1;
        scheduledExposureThisWeekByEmployee.set(
          assignment.employeeId,
          exposure,
        );
      }
    }
  }

  const schedulingRequiredEmployees = employees.filter(
    isSchedulingRequiredEmployee,
  );
  const baseSchedulerEmployees: SchedulerEmployee[] = schedulingRequiredEmployees
    .map((employee) => {
      const scheduleTarget = findEastonTargetForEmployee(employee, scheduleTargets);
      const workPattern = getEffectiveWorkPattern({
        employeeWorkPattern: employee.workPattern,
        scheduleTarget,
        expectedWeeklyHours: employee.expectedWeeklyHours,
      });

      return withEastonDerivedAvailability({
        id: employee.id,
        fullName: employee.fullName,
        active: employee.status === "ACTIVE",
        skillIds: employee.skills.map((skill) => skill.skillId).sort(),
        preferredTaskTypeIds: [],
        availability: employee.availability
          .map((window) => ({
            weekday: window.weekday,
            startMinute: window.startMinute,
            endMinute: window.endMinute,
            effectiveStartDate: toIsoDate(window.effectiveStartDate),
            effectiveEndDate: window.effectiveEndDate
              ? toIsoDate(window.effectiveEndDate)
              : null,
            active: window.active,
          }))
          .sort(
            (left, right) =>
              left.weekday - right.weekday ||
              left.startMinute - right.startMinute ||
              left.endMinute - right.endMinute,
          ),
        unavailable: [...employee.ptoRequests, ...employee.nptoRequests]
          .map((request) => ({
            startDate: toIsoDate(request.startDate),
            endDate: toIsoDate(request.endDate),
            startMinute: request.startMinute,
            endMinute: request.endMinute,
            active: true,
          }))
          .sort(
            (left, right) =>
              left.startDate.localeCompare(right.startDate) ||
              left.endDate.localeCompare(right.endDate) ||
              (left.startMinute ?? 0) - (right.startMinute ?? 0),
          ),
        weeklyAssignmentLimit: employee.weeklyAssignmentLimit,
        historicalAssignments: historicalCountByEmployee.get(employee.id) ?? 0,
        historicalTaskAssignments: sortNumberRecord(
          historicalTaskCountByEmployee.get(employee.id) ?? {},
        ),
        historicalClinicalAssignments:
          historicalClinicalCountByEmployee.get(employee.id) ?? 0,
        historicalPatientFacingAssignments:
          historicalPatientFacingCountByEmployee.get(employee.id) ?? 0,
        historicalScheduledHours: historicalHoursByEmployee.get(employee.id) ?? 0,
        historicalSaturdayAssignments:
          historicalSaturdayCountByEmployee.get(employee.id) ?? 0,
        historicalEndoscopyAssignments:
          historicalEndoscopyCountByEmployee.get(employee.id) ?? 0,
        targetWeeklyHours: getEffectiveWeeklyTargetHours({
          workPattern,
          scheduleTarget,
          expectedWeeklyHours: employee.expectedWeeklyHours,
        }),
        requiredBackgroundAssignments: getEffectiveRequiredBackgroundAssignments({
          employeeRequiredBackgroundAssignments:
            employee.requiredWeeklyBackgroundShifts,
          scheduleTarget,
        }),
        scheduledHoursThisWeek:
          scheduledHoursThisWeekByEmployee.get(employee.id) ?? 0,
        scheduledPatientFacingAssignmentsThisWeek:
          scheduledPatientFacingThisWeekByEmployee.get(employee.id) ?? 0,
        scheduledExposureAssignmentsThisWeek:
          scheduledExposureThisWeekByEmployee.get(employee.id) ?? {
            GI: 0,
            ALLERGY: 0,
            PCP: 0,
          },
        scheduledBackgroundAssignmentsThisWeek:
          scheduledBackgroundAssignmentsThisWeekByEmployee.get(employee.id) ?? 0,
        scheduledEarlyStartShiftsThisWeek:
          scheduledEarlyStartsThisWeekByEmployee.get(employee.id) ?? 0,
        workPattern,
        ...targetInputsForEmployee({
          employeeId: employee.id,
          employeeName: employee.fullName,
          scheduleTargets,
          taskTypeIdByCode,
        }),
      } satisfies SchedulerEmployee);
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const weekSkeletons = buildJulyWeekSkeletons({
    employees: baseSchedulerEmployees,
    shiftBlocks: weekScheduleDays.flatMap((day) => {
      const date = toIsoDate(day.date);

      return day.shiftBlocks.map((block) => ({
        id: block.id,
        date,
        shiftCategory: block.shiftCategory,
        startMinute: block.startMinute,
        endMinute: block.endMinute,
        paidHours: Number(block.paidHours),
      }));
    }),
  });
  const schedulerEmployees = baseSchedulerEmployees.map((employee) => ({
    ...employee,
    julyWeekSkeleton: weekSkeletons.get(employee.id) ?? null,
  }));

  const existingAssignments: ExistingAssignment[] = [];
  let slots: SchedulerTaskSlot[] = scheduleDay.taskSlots.map((slot) => ({
    id: slot.id,
    date: input.date,
    shiftBlockId: slot.shiftBlockId,
    shiftTemplateId: slot.shiftBlock.shiftTemplateId,
    shiftCategory: slot.shiftBlock.shiftCategory,
    shiftName: slot.shiftBlock.name,
    paidHours: Number(slot.shiftBlock.paidHours),
    taskTypeId: slot.taskTypeId,
    slotIndex: slot.slotIndex,
    source: slot.source,
    startMinute: slot.startMinute,
    endMinute: slot.endMinute,
    minStaff: slot.minStaff,
    requiredStaff: slot.requiredStaff,
    requirementLevel: slot.requirementLevel,
    patternPreferredEmployeeIds: patternPreferredEmployeeIdsForSlot({
      slot,
      patternSlots: [...patternSlots, ...previousWeekPatternSlots],
    }),
    requiredSkillIds:
      slot.backgroundTaskInstance?.definition.requiredSkills.map(
        (requirement) => requirement.skillId,
      ) ?? [],
    eligibleEmployeeIds:
      slot.backgroundTaskInstance?.definition.eligibleEmployees.map(
        (eligible) => eligible.employeeId,
      ) ?? [],
    canBePulledForClinic:
      slot.backgroundTaskInstance?.definition.canBePulledForClinic ?? false,
    protectedFromPull:
      isEmployeeBgMinimumSlotSource(slot.source) ||
      (slot.backgroundTaskInstance?.definition.protectedFromPull ?? false),
    lockedEmployeeIds: slot.assignments
      .filter(
        (assignment) =>
          assignment.locked ||
          assignment.source === AssignmentSource.MANUAL_OVERRIDE ||
          slot.backgroundTaskInstance?.definition.protectedFromPull === true,
      )
      .map((assignment) => assignment.employeeId)
      .sort(),
  }));

  const saturdayReservationPlan = buildJulySaturdayReservationPlan({
    date: input.date,
    employees: schedulerEmployees,
    slots,
    taskTypes: [...taskTypes.values()],
    existingAssignments,
  });

  if (saturdayReservationPlan.reservations.length > 0) {
    slots = slots.map((slot) => {
      const reservedEmployeeIds =
        saturdayReservationPlan.reservationsBySlotId.get(slot.id);

      return reservedEmployeeIds?.length
        ? {
            ...slot,
            reservedEmployeeIds: [
              ...(slot.reservedEmployeeIds ?? []),
              ...reservedEmployeeIds,
            ].sort(),
          }
        : slot;
    });
  }

  const backgroundMinimumReservations =
    await reserveEmployeeBackgroundMinimumSlotsForDate({
      date: input.date,
      scheduleDay,
      employees: schedulerEmployees,
      backgroundTaskType:
        backgroundTaskType ? schedulerTaskTypeFromTaskType(backgroundTaskType) : null,
      slots,
      taskTypes,
      existingAssignments,
    });
  slots = backgroundMinimumReservations.slots;

  const pullCandidates = selectBackgroundPullCandidates({
    assignments: scheduleDay.taskSlots.flatMap((slot) =>
      slot.assignments.map((assignment) => ({
        assignmentId: assignment.id,
        employeeId: assignment.employeeId,
        taskTypeCode: slot.taskType.code,
        canBePulledForClinic:
          slot.backgroundTaskInstance?.definition.canBePulledForClinic ?? false,
        protectedFromPull:
          isEmployeeBgMinimumSlotSource(slot.source) ||
          (slot.backgroundTaskInstance?.definition.protectedFromPull ?? false),
      })),
    ),
    rules: backgroundPullRules,
  });
  const pullPriorityRules = pullCandidates.flatMap((candidate) =>
    [...taskTypes.values()]
      .filter((taskType) => taskType.isClinical && !taskType.isBackground)
      .map((taskType) => ({
        id: `background-pull:${candidate.assignmentId}:${taskType.id}`,
        type: "PRIORITY_BOOST" as const,
        employeeId: candidate.employeeId,
        taskTypeId: taskType.id,
        weight: Math.max(1, 1000 - candidate.priorityRank * 10),
        priority: 1000,
        active: true,
        parameters: {
          source: "BACKGROUND_PULL_RULE",
          priorityRank: candidate.priorityRank,
        },
      })),
  );

  const schedulerInput = {
    seed: input.seed,
    employees: schedulerEmployees,
    taskTypes: [...taskTypes.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    slots,
    rules: [
      ...rules.map((rule) => ({
        id: rule.id,
        type: rule.type,
        employeeId: rule.employeeId,
        taskTypeId: rule.taskTypeId,
        weight: rule.weight,
        priority: rule.priority,
        active: rule.active,
        effectiveStartDate: rule.effectiveStartDate
          ? toIsoDate(rule.effectiveStartDate)
          : null,
        effectiveEndDate: rule.effectiveEndDate
          ? toIsoDate(rule.effectiveEndDate)
          : null,
        parameters: jsonRecord(rule.parameters),
      })),
      ...pullPriorityRules,
    ],
    existingAssignments,
    fairness: {
      clinicalShiftWeight: fairnessSetting.clinicalShiftWeight,
      patientFacingShiftWeight: fairnessSetting.patientFacingShiftWeight,
      totalShiftWeight: fairnessSetting.totalShiftWeight,
      totalHoursWeight: fairnessSetting.totalHoursWeight,
      saturdayShiftWeight: fairnessSetting.saturdayShiftWeight,
      endoscopyShiftWeight: fairnessSetting.endoscopyShiftWeight,
      patternConsistencyWeight: fairnessSetting.patternConsistencyWeight,
      skillRoleBalanceWeight: fairnessSetting.skillRoleBalanceWeight,
      exposureGoalWeight: fairnessSetting.exposureGoalWeight,
      backgroundPenaltyWeight: fairnessSetting.backgroundPenaltyWeight,
    },
  };

  const inputHash = createHash("sha256")
    .update(stableStringify(schedulerInput))
    .digest("hex");
  const result = generateSchedule(schedulerInput);
  const runtimeDiagnostics = {
    ...result.diagnostics,
    employeeCount: schedulerEmployees.length,
    activeEmployeeCount: schedulerEmployees.filter((employee) => employee.active !== false)
      .length,
    employeesWithAvailability: schedulerEmployees.filter(
      (employee) => employee.availability.length > 0,
    ).length,
    requiredSlotCount: slots.filter(
      (slot) => slot.requirementLevel === "REQUIRED",
    ).length,
    saturdayReservations: saturdayReservationPlan.reservations.length,
    saturdayReservationUnresolved: saturdayReservationPlan.unresolved,
    backgroundMinimumReservations:
      backgroundMinimumReservations.reservations.length,
    backgroundMinimumSlotsCreated:
      backgroundMinimumReservations.createdSlotIds.length,
    backgroundMinimumSlotsCancelled:
      backgroundMinimumReservations.cancelledSlotIds.length,
    backgroundMinimumUnresolved: backgroundMinimumReservations.unresolved,
    firstConflictReasons: result.conflicts.slice(0, 5).map((conflict) => ({
      slotId: conflict.slotId,
      reason: conflict.reason,
      rejectedCandidates: conflict.rejectedCandidates.slice(0, 3),
    })),
  };

  if (process.env.NODE_ENV !== "production") {
    console.info("[schedule.generate]", {
      date: input.date,
      ...runtimeDiagnostics,
    });
  }

  const generationRun = await getDb().scheduleGenerationRun.create({
    data: {
      dateStart: parseIsoDate(input.date),
      dateEnd: parseIsoDate(input.date),
      seed: input.seed,
      engineVersion: SCHEDULER_ENGINE_VERSION,
      inputHash,
      requestedByEmployeeId: input.actorEmployeeId ?? undefined,
      status: "COMPLETED",
      completedAt: new Date(),
      summary: runtimeDiagnostics,
    },
  });

  const slotIds = [...new Set(slots.map((slot) => slot.id))];
  const slotIdsForGeneratedRemoval = [
    ...new Set([...slotIds, ...backgroundMinimumReservations.cancelledSlotIds]),
  ];

  await getDb().assignment.updateMany({
    where: {
      taskSlotId: { in: slotIdsForGeneratedRemoval },
      status: "ACTIVE",
      locked: false,
      source: {
        in: [
          AssignmentSource.GENERATED,
          AssignmentSource.COVERAGE_REPLACEMENT,
        ],
      },
      taskSlot: {
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

  if (backgroundMinimumReservations.cancelledSlotIds.length > 0) {
    await getDb().taskSlot.updateMany({
      where: {
        id: { in: backgroundMinimumReservations.cancelledSlotIds },
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
        notes:
          "Cancelled because this generated employee BG minimum slot is no longer needed.",
      },
    });
  }

  for (const assignment of result.assignments) {
    if (assignment.source === "LOCKED") {
      continue;
    }

    await getDb().assignment.create({
      data: {
        taskSlotId: assignment.slotId,
        employeeId: assignment.employeeId,
        source: "GENERATED",
        locked: false,
        generationRunId: generationRun.id,
      },
    });
  }

  const conflictSlotIds = new Set(result.conflicts.map((conflict) => conflict.slotId));
  const conflictsBySlotId = new Map(
    result.conflicts.map((conflict) => [conflict.slotId, conflict]),
  );
  const employeesById = new Map(
    schedulerEmployees.map((employee) => [employee.id, employee]),
  );
  const schedulerSlotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const dbSlotsById = new Map(scheduleDay.taskSlots.map((slot) => [slot.id, slot]));
  const lockedPtoConflictsBySlotId = new Map<string, string>();

  for (const slot of scheduleDay.taskSlots) {
    const schedulerSlot = schedulerSlotsById.get(slot.id);

    if (!schedulerSlot) {
      continue;
    }

    const lockedConflictNames = slot.assignments
      .filter((assignment) => assignment.locked)
      .filter((assignment) => {
        const employee = employeesById.get(assignment.employeeId);

        return employee ? isUnavailableForSlot(employee, schedulerSlot) : false;
      })
      .map((assignment) => assignment.employee.fullName);

    if (lockedConflictNames.length > 0) {
      lockedPtoConflictsBySlotId.set(
        slot.id,
        `Locked assignment conflicts with approved PTO/NPTO/unavailability: ${lockedConflictNames.join(", ")}`,
      );
    }
  }

  const assignedSlotIds = new Set(
    result.assignments.map((assignment) => assignment.slotId),
  );

  for (const slotId of slotIds) {
    const hasBlockingConflict =
      lockedPtoConflictsBySlotId.has(slotId) ||
      conflictSlotIds.has(slotId);
    const status =
      hasBlockingConflict
        ? TaskSlotStatus.SHORTAGE
        : assignedSlotIds.has(slotId)
          ? TaskSlotStatus.FILLED
          : TaskSlotStatus.OPEN;

    await getDb().taskSlot.update({
      where: { id: slotId },
      data: {
        status,
        notes:
          lockedPtoConflictsBySlotId.get(slotId) ??
          (conflictsBySlotId.has(slotId)
            ? formatConflictNote(
                conflictsBySlotId.get(slotId)!,
                selectShortageRecommendations({
                  slot: dbSlotsById.get(slotId),
                  scenario: scheduleDay.scenario,
                  rules: shortageRules,
                }),
              )
            : null),
      },
    });
  }

  await getDb().scheduleDay.update({
    where: { id: scheduleDay.id },
    data: {
      status: "GENERATED",
      publishedAt: null,
      publishedByEmployeeId: null,
    },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "schedule.generate",
    entityType: "ScheduleDay",
    entityId: scheduleDay.id,
    after: {
      generationRunId: generationRun.id,
      diagnostics: runtimeDiagnostics,
    },
  });

  return { ...result, diagnostics: runtimeDiagnostics };
}

export async function publishScheduleForDate(input: {
  date: string;
  actorEmployeeId?: string | null;
  overrideReason?: string | null;
}) {
  const scheduleDay = await getScheduleBoard(input.date);

  if (!scheduleDay) {
    throw new Error("Prepare and generate a schedule before publishing.");
  }

  const publishIssues = getSchedulePublishIssues(scheduleDay);
  const week = clinicWeekRange(input.date);
  const hardRequirements = await getWeeklyHardRequirementSummary(week);

  const blockingMessages = [
    ...publishIssues.map((issue) => issue.message),
    ...hardRequirements.issues.map((issue) => issue.message),
  ];

  if (blockingMessages.length > 0 && !input.overrideReason?.trim()) {
    throw new Error(
      `Schedule cannot be published. ${blockingMessages.slice(0, 6).join(" ")}`,
    );
  }

  const published = await getDb().scheduleDay.update({
    where: { id: scheduleDay.id },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      publishedByEmployeeId: input.actorEmployeeId ?? undefined,
    },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "schedule.publish",
    entityType: "ScheduleDay",
    entityId: published.id,
    before: { status: scheduleDay.status },
    after: { status: published.status, publishedAt: published.publishedAt },
    metadata: {
      overrideReason: input.overrideReason?.trim() || null,
      publishIssues,
      hardRequirementIssues: hardRequirements.issues,
    },
  });

  return published;
}

export async function unpublishScheduleForDate(input: {
  date: string;
  actorEmployeeId?: string | null;
}) {
  const scheduleDay = await getScheduleBoard(input.date);

  if (!scheduleDay) {
    throw new Error("Schedule day not found.");
  }

  if (scheduleDay.status !== "PUBLISHED") {
    throw new Error("Only published schedules can be unpublished.");
  }

  const unpublished = await getDb().scheduleDay.update({
    where: { id: scheduleDay.id },
    data: {
      status: "GENERATED",
      publishedAt: null,
      publishedByEmployeeId: null,
    },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "schedule.unpublish",
    entityType: "ScheduleDay",
    entityId: unpublished.id,
    before: {
      status: scheduleDay.status,
      publishedAt: scheduleDay.publishedAt,
      publishedByEmployeeId: scheduleDay.publishedByEmployeeId,
    },
    after: { status: unpublished.status },
  });

  return unpublished;
}

type ScheduleBoardDay = NonNullable<Awaited<ReturnType<typeof getScheduleBoard>>>;
type ScheduleBoardTaskSlot = ScheduleBoardDay["taskSlots"][number];
type ScheduleBoardShiftBlock = ScheduleBoardDay["shiftBlocks"][number];

type TaskTypeWithSkills = {
  id: string;
  code: string;
  name: string;
  skillRequirements: Array<{ skillId: string }>;
  interchangeableGroup: string | null;
  difficultyWeight: number;
  sortOrder: number;
  isPatientFacing: boolean;
  isClinical: boolean;
  isBackground: boolean;
  isSkilled: boolean;
  isEndoscopy: boolean;
  isFloat: boolean;
  isClosureCandidate: boolean;
};

function schedulerTaskTypeFromTaskType(
  taskType: TaskTypeWithSkills,
): SchedulerTaskType {
  return {
    id: taskType.id,
    code: taskType.code,
    name: taskType.name,
    requiredSkillIds: taskType.skillRequirements.map(
      (requirement) => requirement.skillId,
    ),
    interchangeableGroup: taskType.interchangeableGroup,
    difficultyWeight: taskType.difficultyWeight,
    sortOrder: taskType.sortOrder,
    isPatientFacing: taskType.isPatientFacing,
    isClinical: taskType.isClinical,
    isBackground: taskType.isBackground,
    isSkilled: taskType.isSkilled,
    isEndoscopy: taskType.isEndoscopy,
    isFloat: taskType.isFloat,
    isClosureCandidate: taskType.isClosureCandidate,
    exposureGroup: taskExposureGroup(taskType.code),
  };
}

async function reserveEmployeeBackgroundMinimumSlotsForDate(input: {
  date: string;
  scheduleDay: ScheduleBoardDay;
  employees: SchedulerEmployee[];
  backgroundTaskType: SchedulerTaskType | null;
  slots: SchedulerTaskSlot[];
  taskTypes: Map<string, SchedulerTaskType>;
  existingAssignments: ExistingAssignment[];
}) {
  const protectedExistingBgMinimumSlotIds = new Set(
    input.scheduleDay.taskSlots
      .filter((slot) => isEmployeeBgMinimumSlotSource(slot.source))
      .filter(hasProtectedAssignment)
      .map((slot) => slot.id),
  );
  const slotsById = new Map(input.slots.map((slot) => [slot.id, slot]));
  const finalSlotsById = new Map(
    input.slots
      .filter(
        (slot) =>
          !isEmployeeBgMinimumSlotSource(slot.source) ||
          protectedExistingBgMinimumSlotIds.has(slot.id),
      )
      .map((slot) => [slot.id, slot]),
  );
  const reusableBgMinimumSlotsByShiftBlock = new Map<string, SchedulerTaskSlot[]>();

  for (const slot of input.slots) {
    if (
      !isEmployeeBgMinimumSlotSource(slot.source) ||
      protectedExistingBgMinimumSlotIds.has(slot.id) ||
      slot.taskTypeId !== input.backgroundTaskType?.id ||
      !slot.shiftBlockId
    ) {
      continue;
    }

    const reusableSlots =
      reusableBgMinimumSlotsByShiftBlock.get(slot.shiftBlockId) ?? [];
    reusableSlots.push(slot);
    reusableBgMinimumSlotsByShiftBlock.set(slot.shiftBlockId, reusableSlots);
  }

  const reservations: Array<{
    employeeId: string;
    employeeName: string;
    slotId: string;
    shiftBlockId: string;
  }> = [];
  const unresolved: Array<{
    employeeId: string;
    employeeName: string;
    required: number;
    assigned: number;
    reason: string;
  }> = [];
  const createdSlotIds: string[] = [];
  const usedReusableSlotIds = new Set<string>();
  const simulatedAssignments = [
    ...input.existingAssignments,
    ...prefilledExistingAssignmentsFromSlots(input.slots, input.taskTypes),
  ];
  const currentDayBgByEmployee = countCanonicalBgAssignments(
    simulatedAssignments,
    input.taskTypes,
  );

  if (!input.backgroundTaskType || !isCanonicalBgTaskType(input.backgroundTaskType)) {
    for (const employee of input.employees) {
      const required = requiredBackgroundAssignmentsForEmployee(employee);
      const assigned =
        (employee.scheduledBackgroundAssignmentsThisWeek ?? 0) +
        (currentDayBgByEmployee.get(employee.id) ?? 0);

      if (required > assigned) {
        unresolved.push({
          employeeId: employee.id,
          employeeName: employee.fullName,
          required,
          assigned,
          reason: "Literal BACKGROUND task type is not configured.",
        });
      }
    }

    return {
      slots: [...finalSlotsById.values()],
      reservations,
      unresolved,
      createdSlotIds,
      cancelledSlotIds: obsoleteEmployeeBgMinimumSlotIds({
        slotsById,
        finalSlotsById,
        protectedExistingBgMinimumSlotIds,
      }),
    };
  }

  const weekday = parseIsoDate(input.date).getUTCDay();

  if (weekday === 0 || weekday === 6 || input.scheduleDay.scenario === "CLINIC_CLOSED") {
    return {
      slots: [...finalSlotsById.values()],
      reservations,
      unresolved,
      createdSlotIds,
      cancelledSlotIds: obsoleteEmployeeBgMinimumSlotIds({
        slotsById,
        finalSlotsById,
        protectedExistingBgMinimumSlotIds,
      }),
    };
  }

  const employeesWithMissingBg = input.employees
    .map((employee) => {
      const required = requiredBackgroundAssignmentsForEmployee(employee);
      const assigned =
        (employee.scheduledBackgroundAssignmentsThisWeek ?? 0) +
        (currentDayBgByEmployee.get(employee.id) ?? 0);

      return {
        employee,
        required,
        assigned,
        missing: Math.max(0, required - assigned),
      };
    })
    .filter((entry) => entry.missing > 0)
    .sort(
      (left, right) =>
        right.missing - left.missing ||
        left.employee.fullName.localeCompare(right.employee.fullName) ||
        left.employee.id.localeCompare(right.employee.id),
    );

  const nextSlotIndexes = new Map<string, number>();

  for (const entry of employeesWithMissingBg) {
    let missing = entry.missing;
    let remainingReservationsToday = Math.min(
      missing,
      maxBackgroundMinimumReservationsForDate({
        employee: entry.employee,
        date: input.date,
        missing,
      }),
    );

    while (remainingReservationsToday > 0) {
      const candidate = selectBackgroundMinimumShiftBlock({
        employee: entry.employee,
        date: input.date,
        shiftBlocks: input.scheduleDay.shiftBlocks,
        backgroundTaskType: input.backgroundTaskType,
        slots: input.slots,
        taskTypes: input.taskTypes,
        assignments: simulatedAssignments,
        reusableBgMinimumSlotsByShiftBlock,
        usedReusableSlotIds,
      });

      if (!candidate) {
        if (
          remainingBackgroundMinimumReservationDays(entry.employee, input.date) <= 1
        ) {
          unresolved.push({
            employeeId: entry.employee.id,
            employeeName: entry.employee.fullName,
            required: entry.required,
            assigned: entry.required - missing,
            reason: "No legal weekday background slot remains inside the Current Easton skeleton.",
          });
        }
        break;
      }

      const reservedSlot = candidate.reusableSlot
        ? await reserveReusableBackgroundMinimumSlot({
            slot: candidate.reusableSlot,
            employee: entry.employee,
            shiftBlock: candidate.shiftBlock,
          })
        : await createBackgroundMinimumSlot({
            date: input.date,
            scheduleDayId: input.scheduleDay.id,
            backgroundTaskTypeId: input.backgroundTaskType.id,
            employee: entry.employee,
            shiftBlock: candidate.shiftBlock,
            nextSlotIndexes,
          });

      if (!candidate.reusableSlot) {
        createdSlotIds.push(reservedSlot.id);
      } else {
        usedReusableSlotIds.add(candidate.reusableSlot.id);
      }

      finalSlotsById.set(reservedSlot.id, reservedSlot);
      simulatedAssignments.push(
        existingAssignmentFromSlot(
          entry.employee.id,
          reservedSlot,
          input.backgroundTaskType,
        ),
      );
      currentDayBgByEmployee.set(
        entry.employee.id,
        (currentDayBgByEmployee.get(entry.employee.id) ?? 0) + 1,
      );
      reservations.push({
        employeeId: entry.employee.id,
        employeeName: entry.employee.fullName,
        slotId: reservedSlot.id,
        shiftBlockId: reservedSlot.shiftBlockId ?? candidate.shiftBlock.id,
      });
      missing -= 1;
      remainingReservationsToday -= 1;
    }
  }

  return {
    slots: [...finalSlotsById.values()],
    reservations,
    unresolved,
    createdSlotIds,
    cancelledSlotIds: obsoleteEmployeeBgMinimumSlotIds({
      slotsById,
      finalSlotsById,
      protectedExistingBgMinimumSlotIds,
    }),
  };
}

function maxBackgroundMinimumReservationsForDate(input: {
  employee: SchedulerEmployee;
  date: string;
  missing: number;
}) {
  const remainingDays = remainingBackgroundMinimumReservationDays(
    input.employee,
    input.date,
  );

  return Math.max(1, Math.ceil(input.missing / remainingDays));
}

function remainingBackgroundMinimumReservationDays(
  employee: SchedulerEmployee,
  date: string,
) {
  if (!employee.julyWeekSkeleton) {
    return 1;
  }

  const remainingDays = employee.julyWeekSkeleton.plannedDays.filter((day) => {
    if (day.date < date || day.kind === "OFF") {
      return false;
    }

    const weekday = parseIsoDate(day.date).getUTCDay();

    return weekday > 0 && weekday < 6 && day.allowedShiftBlockIds.length > 0;
  }).length;

  return Math.max(1, remainingDays);
}

function requiredBackgroundAssignmentsForEmployee(employee: SchedulerEmployee) {
  if (
    employee.active === false ||
    (employee.targetWeeklyHours !== null &&
      employee.targetWeeklyHours !== undefined &&
      employee.targetWeeklyHours <= 0)
  ) {
    return 0;
  }

  return Math.max(0, employee.requiredBackgroundAssignments ?? 0);
}

function hasProtectedAssignment(slot: ScheduleBoardTaskSlot) {
  return slot.assignments.some(
    (assignment) =>
      assignment.locked ||
      assignment.source === AssignmentSource.MANUAL_OVERRIDE,
  );
}

function obsoleteEmployeeBgMinimumSlotIds(input: {
  slotsById: Map<string, SchedulerTaskSlot>;
  finalSlotsById: Map<string, SchedulerTaskSlot>;
  protectedExistingBgMinimumSlotIds: Set<string>;
}) {
  return [...input.slotsById.values()]
    .filter((slot) => isEmployeeBgMinimumSlotSource(slot.source))
    .filter((slot) => !input.finalSlotsById.has(slot.id))
    .filter((slot) => !input.protectedExistingBgMinimumSlotIds.has(slot.id))
    .map((slot) => slot.id);
}

function selectBackgroundMinimumShiftBlock(input: {
  employee: SchedulerEmployee;
  date: string;
  shiftBlocks: ScheduleBoardShiftBlock[];
  backgroundTaskType: SchedulerTaskType;
  slots: SchedulerTaskSlot[];
  taskTypes: Map<string, SchedulerTaskType>;
  assignments: ExistingAssignment[];
  reusableBgMinimumSlotsByShiftBlock: Map<string, SchedulerTaskSlot[]>;
  usedReusableSlotIds: Set<string>;
}) {
  const requiredShiftBlockIds = new Set(
    input.employee.julyWeekSkeleton?.plannedDays.find(
      (day) => day.date === input.date,
    )?.requiredShiftBlockIds ?? [],
  );
  const shiftBlocks = [...input.shiftBlocks]
    .filter((block) => isWeekdayBackgroundMinimumShiftBlock(input.employee, block))
    .sort(
      (left, right) =>
        requiredClinicDemandForEmployeeOnShiftBlock({
          employee: input.employee,
          shiftBlockId: left.id,
          slots: input.slots,
          taskTypes: input.taskTypes,
        }) -
          requiredClinicDemandForEmployeeOnShiftBlock({
            employee: input.employee,
            shiftBlockId: right.id,
            slots: input.slots,
            taskTypes: input.taskTypes,
          }) ||
        Number(requiredShiftBlockIds.has(right.id)) -
          Number(requiredShiftBlockIds.has(left.id)) ||
        left.startMinute - right.startMinute ||
        left.endMinute - right.endMinute ||
        left.id.localeCompare(right.id),
    );

  for (const shiftBlock of shiftBlocks) {
    const reusableSlot = (
      input.reusableBgMinimumSlotsByShiftBlock.get(shiftBlock.id) ?? []
    ).find((slot) => !input.usedReusableSlotIds.has(slot.id));
    const slot = reusableSlot
      ? reservedBackgroundMinimumSchedulerSlot({
          slot: reusableSlot,
          employeeId: input.employee.id,
          shiftBlock,
        })
      : backgroundMinimumCandidateSlot({
          date: input.date,
          employeeId: input.employee.id,
          shiftBlock,
          backgroundTaskTypeId: input.backgroundTaskType.id,
        });
    const rejections = getConstraintRejections(
      input.employee,
      input.backgroundTaskType,
      slot,
      input.assignments,
    );

    if (rejections.length === 0) {
      return { shiftBlock, reusableSlot };
    }
  }

  return null;
}

function requiredClinicDemandForEmployeeOnShiftBlock(input: {
  employee: SchedulerEmployee;
  shiftBlockId: string;
  slots: SchedulerTaskSlot[];
  taskTypes: Map<string, SchedulerTaskType>;
}) {
  return input.slots
    .filter(
      (slot) =>
        slot.shiftBlockId === input.shiftBlockId &&
        slot.requirementLevel === "REQUIRED",
    )
    .reduce((count, slot) => {
      const taskType = input.taskTypes.get(slot.taskTypeId);

      if (!taskType || taskType.isBackground) {
        return count;
      }

      return hasRequiredSkills(input.employee, taskType, slot)
        ? count + Math.max(1, slot.requiredStaff ?? 1)
        : count;
    }, 0);
}

function isWeekdayBackgroundMinimumShiftBlock(
  employee: SchedulerEmployee,
  shiftBlock: ScheduleBoardShiftBlock,
) {
  if (
    shiftBlock.shiftCategory === "SATURDAY" ||
    shiftBlock.shiftCategory === "ENDO"
  ) {
    return false;
  }

  if (!employee.julyWeekSkeleton) {
    return true;
  }

  return employee.julyWeekSkeleton.allowedShiftBlockIds.includes(shiftBlock.id);
}

function backgroundMinimumCandidateSlot(input: {
  date: string;
  employeeId: string;
  shiftBlock: ScheduleBoardShiftBlock;
  backgroundTaskTypeId: string;
}): SchedulerTaskSlot {
  return {
    id: `employee-bg-minimum:${input.employeeId}:${input.shiftBlock.id}`,
    date: input.date,
    shiftBlockId: input.shiftBlock.id,
    shiftTemplateId: input.shiftBlock.shiftTemplateId,
    shiftCategory: input.shiftBlock.shiftCategory,
    shiftName: input.shiftBlock.name,
    paidHours: Number(input.shiftBlock.paidHours),
    taskTypeId: input.backgroundTaskTypeId,
    slotIndex: 1,
    source: EMPLOYEE_BG_MINIMUM_SOURCE,
    requirementLevel: "REQUIRED",
    startMinute: input.shiftBlock.startMinute,
    endMinute: input.shiftBlock.endMinute,
    minStaff: 1,
    requiredStaff: 1,
    reservedEmployeeIds: [input.employeeId],
    canBePulledForClinic: false,
    protectedFromPull: true,
  };
}

function reservedBackgroundMinimumSchedulerSlot(input: {
  slot: SchedulerTaskSlot;
  employeeId: string;
  shiftBlock: ScheduleBoardShiftBlock;
}) {
  return {
    ...input.slot,
    source: EMPLOYEE_BG_MINIMUM_SOURCE,
    requirementLevel: "REQUIRED" as const,
    minStaff: 1,
    requiredStaff: 1,
    startMinute: input.shiftBlock.startMinute,
    endMinute: input.shiftBlock.endMinute,
    paidHours: Number(input.shiftBlock.paidHours),
    reservedEmployeeIds: uniqueStrings([
      ...(input.slot.reservedEmployeeIds ?? []),
      input.employeeId,
    ]),
    canBePulledForClinic: false,
    protectedFromPull: true,
  };
}

async function reserveReusableBackgroundMinimumSlot(input: {
  slot: SchedulerTaskSlot;
  employee: SchedulerEmployee;
  shiftBlock: ScheduleBoardShiftBlock;
}) {
  const reservedSlot = reservedBackgroundMinimumSchedulerSlot({
    slot: input.slot,
    employeeId: input.employee.id,
    shiftBlock: input.shiftBlock,
  });

  await getDb().taskSlot.update({
    where: { id: input.slot.id },
    data: {
      label: employeeBackgroundMinimumSlotLabel(input.employee.fullName),
      startMinute: input.shiftBlock.startMinute,
      endMinute: input.shiftBlock.endMinute,
      minStaff: 1,
      requiredStaff: 1,
      requirementLevel: "REQUIRED",
      source: EMPLOYEE_BG_MINIMUM_SOURCE,
      status: TaskSlotStatus.OPEN,
      notes: employeeBackgroundMinimumSlotNote(input.employee.fullName),
    },
  });

  return reservedSlot;
}

async function createBackgroundMinimumSlot(input: {
  date: string;
  scheduleDayId: string;
  backgroundTaskTypeId: string;
  employee: SchedulerEmployee;
  shiftBlock: ScheduleBoardShiftBlock;
  nextSlotIndexes: Map<string, number>;
}) {
  const slotIndex = await nextBackgroundMinimumSlotIndex({
    scheduleDayId: input.scheduleDayId,
    shiftBlockId: input.shiftBlock.id,
    taskTypeId: input.backgroundTaskTypeId,
    nextSlotIndexes: input.nextSlotIndexes,
  });
  const slot = await getDb().taskSlot.create({
    data: {
      scheduleDayId: input.scheduleDayId,
      shiftBlockId: input.shiftBlock.id,
      taskTypeId: input.backgroundTaskTypeId,
      slotIndex,
      label: employeeBackgroundMinimumSlotLabel(input.employee.fullName),
      startMinute: input.shiftBlock.startMinute,
      endMinute: input.shiftBlock.endMinute,
      minStaff: 1,
      requiredStaff: 1,
      requirementLevel: "REQUIRED",
      source: EMPLOYEE_BG_MINIMUM_SOURCE,
      status: TaskSlotStatus.OPEN,
      notes: employeeBackgroundMinimumSlotNote(input.employee.fullName),
    },
  });
  const schedulerSlot = backgroundMinimumCandidateSlot({
    date: input.date,
    employeeId: input.employee.id,
    shiftBlock: input.shiftBlock,
    backgroundTaskTypeId: input.backgroundTaskTypeId,
  });

  return {
    ...schedulerSlot,
    id: slot.id,
    slotIndex,
  };
}

async function nextBackgroundMinimumSlotIndex(input: {
  scheduleDayId: string;
  shiftBlockId: string;
  taskTypeId: string;
  nextSlotIndexes: Map<string, number>;
}) {
  const key = `${input.shiftBlockId}:${input.taskTypeId}`;
  const cached = input.nextSlotIndexes.get(key);

  if (cached !== undefined) {
    const next = cached + 1;
    input.nextSlotIndexes.set(key, next);
    return next;
  }

  const existing = await getDb().taskSlot.aggregate({
    where: {
      scheduleDayId: input.scheduleDayId,
      shiftBlockId: input.shiftBlockId,
      taskTypeId: input.taskTypeId,
    },
    _max: { slotIndex: true },
  });
  const next = (existing._max.slotIndex ?? 0) + 1;
  input.nextSlotIndexes.set(key, next);

  return next;
}

function employeeBackgroundMinimumSlotLabel(employeeName: string) {
  return `Required BG minimum - ${employeeName}`;
}

function employeeBackgroundMinimumSlotNote(employeeName: string) {
  return `Reserved before ordinary schedule generation to satisfy ${employeeName}'s required literal BG minimum.`;
}

function prefilledExistingAssignmentsFromSlots(
  slots: SchedulerTaskSlot[],
  taskTypes: Map<string, SchedulerTaskType>,
) {
  const assignments: ExistingAssignment[] = [];

  for (const slot of slots) {
    const taskType = taskTypes.get(slot.taskTypeId);

    if (!taskType) {
      continue;
    }

    const lockedEmployeeIds = uniqueStrings([
      ...(slot.lockedEmployeeIds ?? []),
      ...(slot.lockedEmployeeId ? [slot.lockedEmployeeId] : []),
    ]);
    const reservedEmployeeIds = uniqueStrings(
      slot.reservedEmployeeIds ?? [],
    ).filter((employeeId) => !lockedEmployeeIds.includes(employeeId));

    for (const employeeId of [...lockedEmployeeIds, ...reservedEmployeeIds]) {
      assignments.push(existingAssignmentFromSlot(employeeId, slot, taskType));
    }
  }

  return assignments;
}

function existingAssignmentFromSlot(
  employeeId: string,
  slot: SchedulerTaskSlot,
  taskType: SchedulerTaskType,
): ExistingAssignment {
  return {
    slotId: slot.id,
    employeeId,
    date: slot.date,
    taskTypeId: slot.taskTypeId,
    startMinute: slot.startMinute,
    endMinute: slot.endMinute,
    shiftBlockId: slot.shiftBlockId,
    shiftCategory: slot.shiftCategory,
    paidHours: slot.paidHours,
    isPatientFacing: taskType.isPatientFacing,
    isClinical: taskType.isClinical,
    isBackground: taskType.isBackground,
    isFloat: taskType.isFloat,
    isEndoscopy: taskType.isEndoscopy,
    exposureGroup: taskExposureGroup(taskType.code),
    canBePulledForClinic: slot.canBePulledForClinic,
    protectedFromPull: slot.protectedFromPull,
  };
}

function countCanonicalBgAssignments(
  assignments: ExistingAssignment[],
  taskTypes: Map<string, SchedulerTaskType>,
) {
  const counts = new Map<string, number>();

  for (const assignment of assignments) {
    const taskType = taskTypes.get(assignment.taskTypeId);

    if (!taskType || !isCanonicalBgTaskType(taskType)) {
      continue;
    }

    counts.set(
      assignment.employeeId,
      (counts.get(assignment.employeeId) ?? 0) + 1,
    );
  }

  return counts;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)].sort();
}

function formatConflictNote(conflict: {
  reason: string;
  rejectedCandidates: { employeeId: string; reasons: string[] }[];
}, recommendations: string[] = []) {
  const rejectionSummary = conflict.rejectedCandidates
    .slice(0, 4)
    .map((candidate) => `${candidate.employeeId}: ${candidate.reasons.join(", ")}`)
    .join(" | ");

  const baseNote = rejectionSummary
    ? `${conflict.reason}. ${rejectionSummary}`
    : conflict.reason;

  return recommendations.length > 0
    ? `${baseNote}. Recommendations: ${recommendations.join(" ")}`
    : baseNote;
}

async function getPreviousPublishedWeekPatternSlots(date: string) {
  const previousDate = addDaysIsoDate(date, -7);
  const previousDay = await getDb().scheduleDay.findUnique({
    where: { date: parseIsoDate(previousDate) },
    select: {
      status: true,
      taskSlots: {
        where: { status: { not: "CANCELLED" } },
        select: {
          taskTypeId: true,
          slotIndex: true,
          shiftBlock: {
            select: {
              shiftTemplateId: true,
              shiftCategory: true,
            },
          },
          assignments: {
            where: { status: "ACTIVE" },
            select: { employeeId: true },
            orderBy: { assignedAt: "asc" },
          },
        },
      },
    },
  });

  if (!previousDay || previousDay.status !== "PUBLISHED") {
    return [];
  }

  return previousDay.taskSlots.flatMap((slot) =>
    slot.assignments.map((assignment) => ({
      taskTypeId: slot.taskTypeId,
      slotIndex: slot.slotIndex,
      shiftTemplateId: slot.shiftBlock.shiftTemplateId,
      shiftCategory: slot.shiftBlock.shiftCategory,
      preferredEmployeeId: assignment.employeeId,
    })),
  );
}

function targetInputsForEmployee(input: {
  employeeId: string;
  employeeName: string;
  scheduleTargets: {
    employeeId: string | null;
    employeeName: string;
    targetPatientShifts: Prisma.Decimal | null;
    targetTaskCounts: Prisma.JsonValue;
    exposureGoals: Prisma.JsonValue;
  }[];
  taskTypeIdByCode: Map<string, string>;
}) {
  const target = findEastonTargetForEmployee(
    { id: input.employeeId, fullName: input.employeeName },
    input.scheduleTargets,
  );

  if (!target) {
    return {};
  }

  const targetTaskAssignments: Record<string, number> = {};
  const targetTaskCounts = jsonNumberRecord(target.targetTaskCounts);

  for (const [roleCode, count] of Object.entries(targetTaskCounts)) {
    const taskTypeId = input.taskTypeIdByCode.get(roleCode);

    if (taskTypeId) {
      targetTaskAssignments[taskTypeId] = count;
    }
  }

  return {
    targetPatientFacingAssignments: target.targetPatientShifts
      ? Number(target.targetPatientShifts)
      : null,
    targetTaskAssignments,
    exposureGoals: jsonStringArray(target.exposureGoals),
  };
}

function taskExposureGroup(code: string) {
  return julyPatientShiftGroupFromTaskCode(code);
}

function jsonNumberRecord(value: Prisma.JsonValue) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, Number(item)])
      .filter(([, item]) => Number.isFinite(item)),
  ) as Record<string, number>;
}

function jsonStringArray(value: Prisma.JsonValue) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function jsonRecord(value: Prisma.JsonValue) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

async function reconcileSlotsForStaffingRequirements(input: {
  scheduleDayId: string;
  date: string;
  scenario: ClinicScenario;
}) {
  const db = getDb();
  const shiftBlocks = await ensureShiftBlocksForScheduleDay(input);
  const [taskTypes, rules] = await Promise.all([
    db.taskType.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        optional: true,
        active: true,
        defaultForRoutine: true,
        defaultForReduced: true,
        sortOrder: true,
      },
    }),
    db.staffingRequirementRule.findMany({
      where: { active: true },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }],
    }),
  ]);
  const taskTypesById = new Map(taskTypes.map((taskType) => [taskType.id, taskType]));
  const specs = selectStaffingSlotSpecs({
    date: input.date,
    scenario: input.scenario,
    taskTypes,
    rules,
    shiftBlocks: shiftBlocks.map((shiftBlock) => ({
      id: shiftBlock.id,
      shiftTemplateId: shiftBlock.shiftTemplateId,
      shiftCategory: shiftBlock.shiftCategory,
      startMinute: shiftBlock.startMinute,
      defaultForSchedule: shiftBlock.defaultForSchedule,
    })),
  });
  const desiredKeys = new Set(specs.map(slotSpecKey));
  const shiftBlocksById = new Map(shiftBlocks.map((shiftBlock) => [shiftBlock.id, shiftBlock]));

  for (const spec of specs) {
    const taskType = taskTypesById.get(spec.taskTypeId);
    const shiftBlock = shiftBlocksById.get(spec.shiftBlockId);

    if (!taskType || !shiftBlock) {
      continue;
    }

    await upsertPreparedTaskSlot({
      scheduleDayId: input.scheduleDayId,
      taskTypeName: taskType.name,
      shiftBlock,
      spec,
    });
  }

  const slots = await db.taskSlot.findMany({
    where: {
      scheduleDayId: input.scheduleDayId,
      status: { not: "CANCELLED" },
    },
    include: {
      taskType: true,
      assignments: {
        where: { status: "ACTIVE" },
      },
    },
  });

  for (const slot of slots) {
    const key = slotSpecKey(slot);
    const shouldPreserve = shouldPreserveSlotOutsideStaffingRequirements({
      source: slot.source,
      taskTypeOptional: slot.taskType.optional,
    });
    const shouldCancel = !desiredKeys.has(key) && !shouldPreserve;

    if (!shouldCancel) {
      continue;
    }

    const protectedAssignmentCount = slot.assignments.filter(
      (assignment) =>
        assignment.locked ||
        assignment.source === AssignmentSource.MANUAL_OVERRIDE,
    ).length;

    if (protectedAssignmentCount > 0) {
      await db.taskSlot.update({
        where: { id: slot.id },
        data: {
          status: "SHORTAGE",
          notes:
            input.scenario === "CLINIC_CLOSED"
              ? "Clinic is closed, but a manual assignment was preserved."
              : "Staffing requirements no longer include this slot, but a manual assignment was preserved.",
        },
      });
      continue;
    }

    await db.assignment.updateMany({
      where: {
        taskSlotId: slot.id,
        status: "ACTIVE",
      },
      data: {
        status: "REMOVED",
        removedAt: new Date(),
      },
    });

    await db.taskSlot.update({
      where: { id: slot.id },
      data: {
        status: "CANCELLED",
        notes:
          input.scenario === "CLINIC_CLOSED"
            ? "Cancelled because the clinic is closed."
            : "Cancelled because current staffing requirements do not include this slot.",
      },
    });
  }

  return specs.length;
}

async function ensureShiftBlocksForScheduleDay(input: {
  scheduleDayId: string;
  date: string;
  scenario: ClinicScenario;
}) {
  const db = getDb();

  if (input.scenario === "CLINIC_CLOSED") {
    return [];
  }

  const dateValue = parseIsoDate(input.date);
  const weekday = dateValue.getUTCDay();
  const weekdayTemplateWhere =
    weekday >= 1 && weekday <= 5
      ? { OR: [{ dayOfWeek: null }, { dayOfWeek: weekday }] }
      : { dayOfWeek: weekday };
  const templates = await db.shiftTemplate.findMany({
    where: {
      id: { not: LEGACY_SHIFT_TEMPLATE_ID },
      active: true,
      ...weekdayTemplateWhere,
      AND: [
        {
          OR: [
            { effectiveStartDate: null },
            { effectiveStartDate: { lte: dateValue } },
          ],
        },
        {
          OR: [
            { effectiveEndDate: null },
            { effectiveEndDate: { gte: dateValue } },
          ],
        },
      ],
    },
    orderBy: [
      { defaultForSchedule: "desc" },
      { startMinute: "asc" },
      { name: "asc" },
      { id: "asc" },
    ],
  });

  for (const template of templates) {
    await db.shiftBlock.upsert({
      where: {
        scheduleDayId_shiftTemplateId: {
          scheduleDayId: input.scheduleDayId,
          shiftTemplateId: template.id,
        },
      },
      update: {
        defaultForSchedule: template.defaultForSchedule,
        active: true,
      },
      create: {
        scheduleDayId: input.scheduleDayId,
        ...buildShiftBlockSnapshot(template),
      },
    });
  }

  const matchingTemplateIds = templates.map((template) => template.id);

  const shiftBlocks = await db.shiftBlock.findMany({
    where: {
      scheduleDayId: input.scheduleDayId,
      active: true,
      source: { notIn: ["MIGRATION", "FALLBACK"] },
      OR: [
        { shiftTemplateId: null },
        { shiftTemplateId: { in: matchingTemplateIds } },
      ],
    },
    orderBy: [{ startMinute: "asc" }, { name: "asc" }, { id: "asc" }],
  });

  return shiftBlocks;
}

function selectDefaultShiftBlock(shiftBlocks: ShiftBlock[]) {
  return (
    shiftBlocks.find((shiftBlock) => shiftBlock.defaultForSchedule) ??
    shiftBlocks[0] ??
    null
  );
}

async function upsertPreparedTaskSlot(input: {
  scheduleDayId: string;
  taskTypeName: string;
  shiftBlock: ShiftBlock;
  spec: StaffingSlotSpec;
}) {
  const db = getDb();
  const label = `${input.taskTypeName} #${input.spec.slotIndex}`;
  const existingSlot = await db.taskSlot.findUnique({
    where: {
      scheduleDayId_shiftBlockId_taskTypeId_slotIndex: {
        scheduleDayId: input.scheduleDayId,
        shiftBlockId: input.spec.shiftBlockId,
        taskTypeId: input.spec.taskTypeId,
        slotIndex: input.spec.slotIndex,
      },
    },
  });

  if (!existingSlot) {
    await db.taskSlot.create({
      data: {
        scheduleDayId: input.scheduleDayId,
        shiftBlockId: input.spec.shiftBlockId,
        taskTypeId: input.spec.taskTypeId,
        slotIndex: input.spec.slotIndex,
        label,
        startMinute: input.shiftBlock.startMinute,
        endMinute: input.shiftBlock.endMinute,
        status: "OPEN",
        minStaff: 1,
        requiredStaff: 1,
        requirementLevel: input.spec.requirementLevel,
        source: input.spec.source,
        staffingRequirementRuleId: input.spec.staffingRequirementRuleId,
      },
    });
    return;
  }

  await db.taskSlot.update({
    where: { id: existingSlot.id },
    data: {
      label: existingSlot.label ?? label,
      startMinute: existingSlot.startMinute ?? input.shiftBlock.startMinute,
      endMinute: existingSlot.endMinute ?? input.shiftBlock.endMinute,
      status: existingSlot.status === "CANCELLED" ? "OPEN" : existingSlot.status,
      notes: existingSlot.status === "CANCELLED" ? null : existingSlot.notes,
      minStaff: 1,
      requiredStaff: 1,
      requirementLevel: input.spec.requirementLevel,
      source: input.spec.source,
      staffingRequirementRuleId: input.spec.staffingRequirementRuleId,
    },
  });
}

function slotSpecKey(
  value: Pick<StaffingSlotSpec, "shiftBlockId" | "taskTypeId" | "slotIndex">,
) {
  return `${value.shiftBlockId}:${value.taskTypeId}:${value.slotIndex}`;
}

function sortNumberRecord(record: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function getFairnessWindow(
  date: string,
  setting: {
    windowType: string;
    customStartDate: Date | null;
    customEndDate: Date | null;
  },
) {
  if (
    setting.windowType === "CUSTOM" &&
    setting.customStartDate &&
    setting.customEndDate
  ) {
    return {
      startDate: toIsoDate(setting.customStartDate),
      endDate: toIsoDate(setting.customEndDate),
    };
  }

  const end = parseIsoDate(date);
  const start = parseIsoDate(date);
  const days = setting.windowType === "ONE_MONTH" ? 30 : 14;
  start.setUTCDate(start.getUTCDate() - (days - 1));

  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}
