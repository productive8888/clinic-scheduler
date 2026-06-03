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
import { getDb } from "@/lib/db";
import {
  generateSchedule,
  isUnavailableForSlot,
  SCHEDULER_ENGINE_VERSION,
  type ExistingAssignment,
  type SchedulerEmployee,
  type SchedulerTaskSlot,
  type SchedulerTaskType,
} from "@/lib/scheduler";
import { isShortNoticeScheduleChange } from "@/lib/schedule/short-notice";
import { buildShiftBlockSnapshot } from "@/lib/shifts/templates";
import {
  selectStaffingSlotSpecs,
  type StaffingSlotSpec,
} from "@/lib/staffing/requirements";
import { selectShortageRecommendations } from "@/lib/shortage/recommendations";
import { parseIsoDate, toIsoDate } from "@/lib/utils/date";

const FALLBACK_SHIFT_START_MINUTE = 8 * 60;
const FALLBACK_SHIFT_END_MINUTE = 17 * 60;
const FALLBACK_SHIFT_PAID_HOURS = 9;

export async function getScheduleBoard(date: string) {
  return getDb().scheduleDay.findUnique({
    where: { date: parseIsoDate(date) },
    include: {
      taskSlots: {
        where: { status: { not: "CANCELLED" } },
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
          assignments: {
            where: { status: "ACTIVE" },
            include: { employee: true },
            orderBy: { assignedAt: "desc" },
          },
        },
      },
      shiftBlocks: {
        where: { active: true },
        orderBy: [{ startMinute: "asc" }, { name: "asc" }],
      },
      publishedBy: true,
    },
  });
}

export async function getSchedulePageData(date: string) {
  const [scheduleDay, employees, taskTypes] = await Promise.all([
    getScheduleBoard(date),
    getDb().employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      include: { skills: { include: { skill: true } } },
    }),
    getDb().taskType.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { skillRequirements: { include: { skill: true } } },
    }),
  ]);

  return { scheduleDay, employees, taskTypes };
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
}) {
  const db = getDb();
  const changedAt = new Date();

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
    metadata: { shortNotice: result.shortNotice },
  });
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
  const [
    scheduleDay,
    employees,
    historicalAssignments,
    rules,
    shortageRules,
    patternSlots,
    scheduleTargets,
  ] = await Promise.all([
    getScheduleBoard(input.date),
    getDb().employee.findMany({
      where: { status: "ACTIVE" },
      include: {
        skills: true,
        availability: { where: { active: true } },
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
            date: {
              gte: parseIsoDate(fairnessWindow.startDate),
              lte: parseIsoDate(fairnessWindow.endDate),
            },
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
    getDb().employeeScheduleTarget.findMany({
      where: {
        OR: [{ pattern: { active: true } }, { patternId: null }],
      },
      orderBy: [{ employeeName: "asc" }, { id: "asc" }],
    }),
  ]);

  if (!scheduleDay) {
    throw new Error("Schedule day was not created");
  }

  const taskTypes = new Map(
    scheduleDay.taskSlots.map((slot) => [
      slot.taskType.id,
      {
        id: slot.taskType.id,
        code: slot.taskType.code,
        name: slot.taskType.name,
        requiredSkillIds: slot.taskType.skillRequirements.map(
          (requirement) => requirement.skillId,
        ),
        interchangeableGroup: slot.taskType.interchangeableGroup,
        difficultyWeight: slot.taskType.difficultyWeight,
        sortOrder: slot.taskType.sortOrder,
        isPatientFacing: slot.taskType.isPatientFacing,
        isClinical: slot.taskType.isClinical,
        isBackground: slot.taskType.isBackground,
        isSkilled: slot.taskType.isSkilled,
        isEndoscopy: slot.taskType.isEndoscopy,
        isFloat: slot.taskType.isFloat,
        isClosureCandidate: slot.taskType.isClosureCandidate,
        exposureGroup: taskExposureGroup(slot.taskType.code),
      } satisfies SchedulerTaskType,
    ]),
  );
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

    if (assignment.taskSlot.taskType.isPatientFacing) {
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
  }

  const schedulerEmployees: SchedulerEmployee[] = employees
    .map((employee) => ({
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
      ...targetInputsForEmployee({
        employeeId: employee.id,
        employeeName: employee.fullName,
        scheduleTargets,
        taskTypeIdByCode,
      }),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const slots: SchedulerTaskSlot[] = scheduleDay.taskSlots.map((slot) => ({
    id: slot.id,
    date: input.date,
    shiftBlockId: slot.shiftBlockId,
    shiftTemplateId: slot.shiftBlock.shiftTemplateId,
    shiftCategory: slot.shiftBlock.shiftCategory,
    shiftName: slot.shiftBlock.name,
    paidHours: Number(slot.shiftBlock.paidHours),
    taskTypeId: slot.taskTypeId,
    slotIndex: slot.slotIndex,
    startMinute: slot.startMinute,
    endMinute: slot.endMinute,
    minStaff: slot.minStaff,
    requiredStaff: slot.requiredStaff,
    requirementLevel: slot.requirementLevel,
    patternPreferredEmployeeIds: patternPreferredEmployeeIdsForSlot({
      slot,
      patternSlots,
    }),
    lockedEmployeeIds: slot.assignments
      .filter((assignment) => assignment.locked)
      .map((assignment) => assignment.employeeId)
      .sort(),
  }));

  const existingAssignments: ExistingAssignment[] = [];

  const schedulerInput = {
    seed: input.seed,
    employees: schedulerEmployees,
    taskTypes: [...taskTypes.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    slots,
    rules: rules.map((rule) => ({
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
      effectiveEndDate: rule.effectiveEndDate ? toIsoDate(rule.effectiveEndDate) : null,
      parameters: jsonRecord(rule.parameters),
    })),
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
      summary: result.diagnostics,
    },
  });

  const slotIds = scheduleDay.taskSlots.map((slot) => slot.id);

  await getDb().assignment.updateMany({
    where: {
      taskSlotId: { in: slotIds },
      status: "ACTIVE",
      locked: false,
      source: {
        in: [
          AssignmentSource.GENERATED,
          AssignmentSource.COVERAGE_REPLACEMENT,
        ],
      },
    },
    data: {
      status: AssignmentStatus.REMOVED,
      removedAt: new Date(),
    },
  });

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
    const schedulerSlot = schedulerSlotsById.get(slotId);
    const requiredSlot = schedulerSlot?.requirementLevel === "REQUIRED";
    const hasBlockingConflict =
      lockedPtoConflictsBySlotId.has(slotId) ||
      (requiredSlot && conflictSlotIds.has(slotId));
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
      diagnostics: result.diagnostics,
    },
  });

  return result;
}

export async function publishScheduleForDate(input: {
  date: string;
  actorEmployeeId?: string | null;
}) {
  const scheduleDay = await getScheduleBoard(input.date);

  if (!scheduleDay) {
    throw new Error("Prepare and generate a schedule before publishing.");
  }

  const shortageCount = scheduleDay.taskSlots.filter(
    (slot) =>
      slot.requirementLevel === "REQUIRED" &&
      (slot.status === "SHORTAGE" || slot.assignments.length < slot.requiredStaff),
  ).length;

  if (shortageCount > 0) {
    throw new Error("Resolve all shortages before publishing the schedule.");
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

function patternPreferredEmployeeIdsForSlot(input: {
  slot: {
    taskTypeId: string;
    slotIndex: number;
    shiftBlock: {
      shiftTemplateId: string | null;
      shiftCategory: string;
    };
  };
  patternSlots: {
    taskTypeId: string;
    slotIndex: number;
    shiftTemplateId: string | null;
    shiftCategory: string | null;
    preferredEmployeeId: string | null;
  }[];
}) {
  return input.patternSlots
    .filter((patternSlot) => {
      if (patternSlot.taskTypeId !== input.slot.taskTypeId) {
        return false;
      }

      if (patternSlot.slotIndex !== input.slot.slotIndex) {
        return false;
      }

      if (
        patternSlot.shiftTemplateId &&
        patternSlot.shiftTemplateId !== input.slot.shiftBlock.shiftTemplateId
      ) {
        return false;
      }

      if (
        patternSlot.shiftCategory &&
        patternSlot.shiftCategory !== input.slot.shiftBlock.shiftCategory
      ) {
        return false;
      }

      return Boolean(patternSlot.preferredEmployeeId);
    })
    .map((patternSlot) => patternSlot.preferredEmployeeId!)
    .sort();
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
  const target = input.scheduleTargets.find((candidate) => {
    if (candidate.employeeId) {
      return candidate.employeeId === input.employeeId;
    }

    return normalizeName(candidate.employeeName) === normalizeName(input.employeeName);
  });

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
  if (code.includes("GI")) {
    return "GI";
  }

  if (code.includes("ALLERGY")) {
    return "ALLERGY";
  }

  if (code === "FOLLOWUP") {
    return "PCP";
  }

  return null;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
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
    const shouldPreserveAsManual =
      slot.source === "MANUAL" || (slot.taskType.optional && slot.source === "DEFAULT");
    const shouldCancel = !desiredKeys.has(key) && !shouldPreserveAsManual;

    if (!shouldCancel) {
      continue;
    }

    const lockedAssignmentCount = slot.assignments.filter(
      (assignment) => assignment.locked,
    ).length;

    if (lockedAssignmentCount > 0) {
      await db.taskSlot.update({
        where: { id: slot.id },
        data: {
          status: "SHORTAGE",
          notes:
            input.scenario === "CLINIC_CLOSED"
              ? "Clinic is closed, but a locked manual assignment was preserved."
              : "Staffing requirements no longer include this slot, but a locked manual assignment was preserved.",
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
      update: {},
      create: {
        scheduleDayId: input.scheduleDayId,
        ...buildShiftBlockSnapshot(template),
      },
    });
  }

  const matchingTemplateIds = templates.map((template) => template.id);

  let shiftBlocks = await db.shiftBlock.findMany({
    where: {
      scheduleDayId: input.scheduleDayId,
      active: true,
      OR: [
        { shiftTemplateId: null },
        { shiftTemplateId: { in: matchingTemplateIds } },
      ],
    },
    orderBy: [{ startMinute: "asc" }, { name: "asc" }, { id: "asc" }],
  });

  if (shiftBlocks.length === 0) {
    const fallback = await db.shiftBlock.create({
      data: {
        scheduleDayId: input.scheduleDayId,
        name: "Default clinic shift",
        startMinute: FALLBACK_SHIFT_START_MINUTE,
        endMinute: FALLBACK_SHIFT_END_MINUTE,
        paidHours: FALLBACK_SHIFT_PAID_HOURS,
        shiftCategory: "OTHER",
        defaultForSchedule: true,
        source: "FALLBACK",
        active: true,
        notes: "Fallback shift block used because no active shift template matched this date.",
      },
    });

    shiftBlocks = [fallback];
  }

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
