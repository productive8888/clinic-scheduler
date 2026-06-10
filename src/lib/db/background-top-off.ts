import { AssignmentSource, type Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { findEastonTargetForEmployee } from "@/lib/easton-import/employee-targets";
import { getConstraintRejections } from "@/lib/scheduler/constraints";
import type {
  ExistingAssignment,
  SchedulerEmployee,
  SchedulerTaskSlot,
  SchedulerTaskType,
} from "@/lib/scheduler";
import { LEGACY_SHIFT_TEMPLATE_ID } from "@/lib/shifts/legacy";
import { validateEmployeeWeekPattern } from "@/lib/schedule/work-pattern-requirements";
import {
  getEffectiveRequiredBackgroundAssignments,
  getEffectiveWeeklyTargetHours,
  getEffectiveWorkPattern,
  type EmployeeScheduleTargetSource,
} from "@/lib/schedule/easton-work-pattern-resolution";
import { withEastonDerivedAvailability } from "@/lib/schedule/easton-derived-availability";
import { parseIsoDate, toIsoDate } from "@/lib/utils/date";

export const GENERATED_BACKGROUND_TOP_OFF_SOURCE =
  "GENERATED_BACKGROUND_TOP_OFF";

type TopOffEmployee = SchedulerEmployee & {
  expectedHours: number;
  requiredBackgroundAssignments: number;
};

type TopOffTaskType = SchedulerTaskType & {
  isBackground: boolean;
};

type TopOffSlot = SchedulerTaskSlot & {
  scheduleDayId: string;
  taskType: TopOffTaskType;
  currentAssignmentCount: number;
  source: string;
};

type TopOffShiftBlock = {
  id: string;
  scheduleDayId: string;
  date: string;
  name: string;
  shiftTemplateId: string | null;
  shiftCategory: SchedulerTaskSlot["shiftCategory"];
  startMinute: number;
  endMinute: number;
  paidHours: number;
};

type TopOffEmployeeState = {
  hours: number;
  backgroundAssignments: number;
  shiftKeys: Set<string>;
};

export type BackgroundTopOffSummary = {
  startDate: string;
  endDate: string;
  slotsCreated: number;
  assignmentsCreated: number;
  employeesCompleted: number;
  employeesMissingBackground: Array<{
    employeeId: string;
    employeeName: string;
    assigned: number;
    required: number;
    reason: string;
  }>;
  employeesUnderExpectedHours: Array<{
    employeeId: string;
    employeeName: string;
    scheduledHours: number;
    expectedHours: number;
    reason: string;
  }>;
  configurationWarnings: string[];
};

export async function clearGeneratedBackgroundTopOffSlots(input: {
  allowedDates: string[];
}) {
  if (input.allowedDates.length === 0) {
    return { slotsRemoved: 0 };
  }

  const result = await getDb().taskSlot.deleteMany({
    where: {
      source: GENERATED_BACKGROUND_TOP_OFF_SOURCE,
      scheduleDay: {
        date: {
          in: input.allowedDates.map(parseIsoDate),
        },
      },
      assignments: {
        none: {
          status: "ACTIVE",
          locked: true,
        },
      },
    },
  });

  return { slotsRemoved: result.count };
}

export async function topOffBackgroundAssignmentsForRange(input: {
  startDate: string;
  endDate: string;
  allowedDates: string[];
  actorEmployeeId?: string | null;
}) {
  const summary: BackgroundTopOffSummary = {
    startDate: input.startDate,
    endDate: input.endDate,
    slotsCreated: 0,
    assignmentsCreated: 0,
    employeesCompleted: 0,
    employeesMissingBackground: [],
    employeesUnderExpectedHours: [],
    configurationWarnings: [],
  };

  if (input.allowedDates.length === 0) {
    return summary;
  }

  const db = getDb();
  const allowedDateSet = new Set(input.allowedDates);
  const [backgroundTaskType, rawEmployees, scheduleDays, scheduleTargets] =
    await Promise.all([
    db.taskType.findFirst({
      where: { code: "BACKGROUND", active: true },
      include: { skillRequirements: true },
    }),
    db.employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      include: {
        skills: true,
        availability: { where: { active: true } },
        workPattern: true,
        ptoRequests: {
          where: {
            status: { in: ["APPROVED", "OVERRIDDEN"] },
            startDate: { lte: parseIsoDate(input.endDate) },
            endDate: { gte: parseIsoDate(input.startDate) },
          },
        },
        nptoRequests: {
          where: {
            status: { in: ["APPROVED", "OVERRIDDEN"] },
            startDate: { lte: parseIsoDate(input.endDate) },
            endDate: { gte: parseIsoDate(input.startDate) },
          },
        },
      },
    }),
    db.scheduleDay.findMany({
      where: {
        date: {
          gte: parseIsoDate(input.startDate),
          lte: parseIsoDate(input.endDate),
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
          where: { status: { not: "CANCELLED" } },
          include: {
            shiftBlock: true,
            taskType: { include: { skillRequirements: true } },
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
              select: {
                id: true,
                employeeId: true,
                locked: true,
              },
            },
          },
        },
      },
    }),
    db.employeeScheduleTarget.findMany({
      where: {
        pattern: {
          code: "EASTON_JULY_ACTIVE_TARGETS",
          active: true,
        },
      },
      orderBy: [{ employeeName: "asc" }, { id: "asc" }],
    }),
  ]);

  if (!backgroundTaskType) {
    summary.configurationWarnings.push(
      "Cannot top off weekly BG/hour targets because the BACKGROUND task type is missing or inactive.",
    );
    return summary;
  }

  const employees = rawEmployees.map((employee) =>
    toTopOffEmployee(employee, findEastonTargetForEmployee(employee, scheduleTargets)),
  );
  const allAssignments: ExistingAssignment[] = [];
  const states = new Map<string, TopOffEmployeeState>(
    employees.map((employee) => [
      employee.id,
      {
        hours: 0,
        backgroundAssignments: 0,
        shiftKeys: new Set<string>(),
      },
    ]),
  );
  const taskSlots: TopOffSlot[] = [];
  const shiftBlocks: TopOffShiftBlock[] = [];

  for (const day of scheduleDays) {
    const date = toIsoDate(day.date);

    if (!allowedDateSet.has(date) || day.scenario === "CLINIC_CLOSED") {
      continue;
    }

    for (const block of day.shiftBlocks) {
      shiftBlocks.push({
        id: block.id,
        scheduleDayId: day.id,
        date,
        name: block.name,
        shiftTemplateId: block.shiftTemplateId,
        shiftCategory: block.shiftCategory,
        startMinute: block.startMinute,
        endMinute: block.endMinute,
        paidHours: Number(block.paidHours),
      });
    }

    for (const slot of day.taskSlots) {
      const topOffSlot: TopOffSlot = {
        id: slot.id,
        date,
        scheduleDayId: day.id,
        shiftBlockId: slot.shiftBlockId,
        shiftTemplateId: slot.shiftBlock.shiftTemplateId,
        shiftCategory: slot.shiftBlock.shiftCategory,
        shiftName: slot.shiftBlock.name,
        paidHours: Number(slot.shiftBlock.paidHours),
        taskTypeId: slot.taskTypeId,
        slotIndex: slot.slotIndex,
        requirementLevel: slot.requirementLevel,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
        minStaff: slot.minStaff,
        requiredStaff: slot.requiredStaff,
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
          slot.backgroundTaskInstance?.definition.protectedFromPull ?? false,
        taskType: {
          id: slot.taskType.id,
          code: slot.taskType.code,
          name: slot.taskType.name,
          requiredSkillIds: slot.taskType.skillRequirements.map(
            (requirement) => requirement.skillId,
          ),
          isPatientFacing: slot.taskType.isPatientFacing,
          isClinical: slot.taskType.isClinical,
          isBackground: slot.taskType.isBackground,
          isSkilled: slot.taskType.isSkilled,
          isEndoscopy: slot.taskType.isEndoscopy,
          isFloat: slot.taskType.isFloat,
        },
        source: slot.source,
        currentAssignmentCount: slot.assignments.length,
      };
      taskSlots.push(topOffSlot);

      for (const assignment of slot.assignments) {
        const state = states.get(assignment.employeeId);
        const shiftKey = shiftKeyForSlot(topOffSlot);

        if (state && !state.shiftKeys.has(shiftKey)) {
          state.shiftKeys.add(shiftKey);
          state.hours += topOffSlot.paidHours ?? 0;
        }

        if (state && topOffSlot.taskType.isBackground) {
          state.backgroundAssignments += 1;
        }

        allAssignments.push({
          slotId: topOffSlot.id,
          employeeId: assignment.employeeId,
          date,
          taskTypeId: slot.taskTypeId,
          startMinute: topOffSlot.startMinute,
          endMinute: topOffSlot.endMinute,
          shiftBlockId: slot.shiftBlockId,
          shiftCategory: topOffSlot.shiftCategory,
          paidHours: topOffSlot.paidHours,
          isPatientFacing: topOffSlot.taskType.isPatientFacing,
          isClinical: topOffSlot.taskType.isClinical,
          isBackground: topOffSlot.taskType.isBackground,
          isFloat: topOffSlot.taskType.isFloat,
          isEndoscopy: topOffSlot.taskType.isEndoscopy,
          canBePulledForClinic: topOffSlot.canBePulledForClinic,
          protectedFromPull: topOffSlot.protectedFromPull,
          locked: assignment.locked,
        });
      }
    }
  }

  const backgroundTask: TopOffTaskType = {
    id: backgroundTaskType.id,
    code: backgroundTaskType.code,
    name: backgroundTaskType.name,
    requiredSkillIds: backgroundTaskType.skillRequirements.map(
      (requirement) => requirement.skillId,
    ),
    isPatientFacing: backgroundTaskType.isPatientFacing,
    isClinical: backgroundTaskType.isClinical,
    isBackground: backgroundTaskType.isBackground,
    isSkilled: backgroundTaskType.isSkilled,
    isEndoscopy: backgroundTaskType.isEndoscopy,
    isFloat: backgroundTaskType.isFloat,
  };
  const hasMissingWorkPatternByEmployeeId = new Map(
    employees.map((employee) => {
      const validation = validateEmployeeWeekPattern({
        employee,
        assignments: toWorkPatternAssignments(
          allAssignments.filter(
            (assignment) => assignment.employeeId === employee.id,
          ),
        ),
      });

      return [
        employee.id,
        !validation.hasRequiredSaturday ||
          validation.missingExtraHourWeekdays.length > 0,
      ] as const;
    }),
  );

  let progress = true;
  let guard = 0;

  while (progress && guard < 500) {
    progress = false;
    guard += 1;

    for (const employee of employeesNeedingTopOff(
      employees,
      states,
      hasMissingWorkPatternByEmployeeId,
    )) {
      const state = states.get(employee.id)!;
      const existingSlot = findExistingBackgroundSlot({
        employee,
        taskSlots,
        allAssignments,
        state,
      });

      if (existingSlot) {
        await assignTopOffSlot({
          slot: existingSlot,
          employee,
          state,
          allAssignments,
          actorEmployeeId: input.actorEmployeeId,
        });
        existingSlot.currentAssignmentCount += 1;
        summary.assignmentsCreated += 1;
        progress = true;
        continue;
      }

      const shiftBlock = findLegalShiftBlockForNewSlot({
        employee,
        shiftBlocks,
        backgroundTask,
        allAssignments,
        state,
      });

      if (!shiftBlock) {
        continue;
      }

      const slot = await createTopOffSlot({
        shiftBlock,
        taskTypeId: backgroundTask.id,
      });
      const topOffSlot: TopOffSlot = {
        id: slot.id,
        date: shiftBlock.date,
        scheduleDayId: shiftBlock.scheduleDayId,
        shiftBlockId: shiftBlock.id,
        shiftTemplateId: shiftBlock.shiftTemplateId,
        shiftCategory: shiftBlock.shiftCategory,
        shiftName: shiftBlock.name,
        paidHours: shiftBlock.paidHours,
        taskTypeId: backgroundTask.id,
        slotIndex: slot.slotIndex,
        requirementLevel: "OPTIONAL",
        startMinute: shiftBlock.startMinute,
        endMinute: shiftBlock.endMinute,
        minStaff: 0,
        requiredStaff: 1,
        requiredSkillIds: [],
        eligibleEmployeeIds: [],
        canBePulledForClinic: true,
        protectedFromPull: false,
        taskType: backgroundTask,
        source: GENERATED_BACKGROUND_TOP_OFF_SOURCE,
        currentAssignmentCount: 0,
      };
      taskSlots.push(topOffSlot);
      summary.slotsCreated += 1;

      await assignTopOffSlot({
        slot: topOffSlot,
        employee,
        state,
        allAssignments,
        actorEmployeeId: input.actorEmployeeId,
      });
      topOffSlot.currentAssignmentCount += 1;
      summary.assignmentsCreated += 1;
      progress = true;
    }
  }

  for (const employee of employees) {
    const state = states.get(employee.id)!;
    const blockerReason = explainTopOffBlocker({
      employee,
      state,
      hasMissingWorkPattern:
        hasMissingWorkPatternByEmployeeId.get(employee.id) ?? false,
      shiftBlocks,
      backgroundTask,
      allAssignments,
    });

    if (
      state.backgroundAssignments >= employee.requiredBackgroundAssignments &&
      state.hours >= employee.expectedHours
    ) {
      summary.employeesCompleted += 1;
    }

    if (state.backgroundAssignments < employee.requiredBackgroundAssignments) {
      summary.employeesMissingBackground.push({
        employeeId: employee.id,
        employeeName: employee.fullName,
        assigned: state.backgroundAssignments,
        required: employee.requiredBackgroundAssignments,
        reason: blockerReason,
      });
    }

    if (state.hours < employee.expectedHours) {
      summary.employeesUnderExpectedHours.push({
        employeeId: employee.id,
        employeeName: employee.fullName,
        scheduledHours: state.hours,
        expectedHours: employee.expectedHours,
        reason: blockerReason,
      });
    }
  }

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "schedule.background_top_off",
    entityType: "ScheduleRange",
    entityId: `${input.startDate}:${input.endDate}`,
    after: summary,
  });

  return summary;
}

function toTopOffEmployee(
  employee: Prisma.EmployeeGetPayload<{
    include: {
      skills: true;
      availability: true;
      workPattern: true;
      ptoRequests: true;
      nptoRequests: true;
    };
  }>,
  scheduleTarget?: EmployeeScheduleTargetSource,
): TopOffEmployee {
  const workPattern = getEffectiveWorkPattern({
    employeeWorkPattern: employee.workPattern,
    scheduleTarget,
    expectedWeeklyHours: employee.expectedWeeklyHours,
  });
  const targetWeeklyHours = getEffectiveWeeklyTargetHours({
    workPattern,
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
    targetWeeklyHours,
    requiredBackgroundAssignments: getEffectiveRequiredBackgroundAssignments({
      employeeRequiredBackgroundAssignments:
        employee.requiredWeeklyBackgroundShifts,
      scheduleTarget,
    }),
    expectedHours: targetWeeklyHours,
    workPattern,
  });
}

function employeesNeedingTopOff(
  employees: TopOffEmployee[],
  states: Map<string, TopOffEmployeeState>,
  hasMissingWorkPatternByEmployeeId: Map<string, boolean>,
) {
  return [...employees]
    .filter((employee) => {
      const state = states.get(employee.id);
      const needsBackground =
        state &&
        state.backgroundAssignments < employee.requiredBackgroundAssignments;
      const needsHours = state && state.hours < employee.expectedHours;
      const hasMissingWorkPattern =
        hasMissingWorkPatternByEmployeeId.get(employee.id) ?? false;

      return Boolean(needsBackground || (needsHours && !hasMissingWorkPattern));
    })
    .sort((left, right) => {
      const leftState = states.get(left.id)!;
      const rightState = states.get(right.id)!;
      const leftBgMissing =
        left.requiredBackgroundAssignments - leftState.backgroundAssignments;
      const rightBgMissing =
        right.requiredBackgroundAssignments - rightState.backgroundAssignments;

      return (
        rightBgMissing - leftBgMissing ||
        leftState.hours - rightState.hours ||
        left.fullName.localeCompare(right.fullName) ||
        left.id.localeCompare(right.id)
      );
    });
}

function findExistingBackgroundSlot(input: {
  employee: TopOffEmployee;
  taskSlots: TopOffSlot[];
  allAssignments: ExistingAssignment[];
  state: TopOffEmployeeState;
}) {
  return input.taskSlots
    .filter((slot) => slot.taskType.isBackground)
    .filter((slot) => slot.currentAssignmentCount < (slot.requiredStaff ?? 1))
    .filter((slot) => canAssignTopOffSlot(input.employee, slot, input.state, input.allAssignments))
    .sort(compareTopOffSlots)[0];
}

function findLegalShiftBlockForNewSlot(input: {
  employee: TopOffEmployee;
  shiftBlocks: TopOffShiftBlock[];
  backgroundTask: TopOffTaskType;
  allAssignments: ExistingAssignment[];
  state: TopOffEmployeeState;
}) {
  return input.shiftBlocks
    .filter((shiftBlock) =>
      canAssignTopOffSlot(
        input.employee,
        {
          id: `new:${shiftBlock.date}:${shiftBlock.id}`,
          date: shiftBlock.date,
          scheduleDayId: shiftBlock.scheduleDayId,
          shiftBlockId: shiftBlock.id,
          shiftTemplateId: shiftBlock.shiftTemplateId,
          shiftCategory: shiftBlock.shiftCategory,
          shiftName: shiftBlock.name,
          paidHours: shiftBlock.paidHours,
          taskTypeId: input.backgroundTask.id,
          slotIndex: 1,
          requirementLevel: "OPTIONAL",
          startMinute: shiftBlock.startMinute,
          endMinute: shiftBlock.endMinute,
          minStaff: 0,
          requiredStaff: 1,
          requiredSkillIds: [],
          eligibleEmployeeIds: [],
          canBePulledForClinic: true,
          protectedFromPull: false,
          taskType: input.backgroundTask,
          source: GENERATED_BACKGROUND_TOP_OFF_SOURCE,
          currentAssignmentCount: 0,
        },
        input.state,
        input.allAssignments,
      ),
    )
    .sort((left, right) => {
      const leftPreferred = weekdayPreferenceScore(input.employee, left);
      const rightPreferred = weekdayPreferenceScore(input.employee, right);

      return (
        rightPreferred - leftPreferred ||
        left.date.localeCompare(right.date) ||
        left.startMinute - right.startMinute ||
        left.id.localeCompare(right.id)
      );
    })[0];
}

function canAssignTopOffSlot(
  employee: TopOffEmployee,
  slot: TopOffSlot,
  state: TopOffEmployeeState,
  allAssignments: ExistingAssignment[],
) {
  const shiftKey = shiftKeyForSlot(slot);
  const wouldAddHours = state.shiftKeys.has(shiftKey) ? 0 : slot.paidHours ?? 0;

  if (state.hours + wouldAddHours > employee.expectedHours) {
    return false;
  }

  return (
    getConstraintRejections(employee, slot.taskType, slot, allAssignments).length === 0
  );
}

function explainTopOffBlocker(input: {
  employee: TopOffEmployee;
  state: TopOffEmployeeState;
  hasMissingWorkPattern: boolean;
  shiftBlocks: TopOffShiftBlock[];
  backgroundTask: TopOffTaskType;
  allAssignments: ExistingAssignment[];
}) {
  if (input.employee.active === false) {
    return "Employee is inactive.";
  }

  if (input.hasMissingWorkPattern) {
    return "Missing required Saturday or extra-hour work-pattern shift; BG/hour top-off waits for hard pattern repair.";
  }

  if (
    input.state.backgroundAssignments < input.employee.requiredBackgroundAssignments &&
    input.state.hours >= input.employee.expectedHours
  ) {
    return "BG minimum is unmet, but the employee is already at expected weekly hours; manager review or reassignment is required.";
  }

  const legalBlock = findLegalShiftBlockForNewSlot({
    employee: input.employee,
    shiftBlocks: input.shiftBlocks,
    backgroundTask: input.backgroundTask,
    allAssignments: input.allAssignments,
    state: input.state,
  });

  if (legalBlock) {
    return "A legal background top-off window was available but generation stopped before assigning it.";
  }

  const candidateReasons = input.shiftBlocks
    .map((shiftBlock) => {
      const slot = slotForTopOffExplanation(input.backgroundTask, shiftBlock);
      const wouldAddHours = input.state.shiftKeys.has(shiftKeyForSlot(slot))
        ? 0
        : shiftBlock.paidHours;

      if (input.state.hours + wouldAddHours > input.employee.expectedHours) {
        return "Would exceed expected weekly hours";
      }

      return getConstraintRejections(
        input.employee,
        input.backgroundTask,
        slot,
        input.allAssignments,
      )[0];
    })
    .filter((reason): reason is string => Boolean(reason));
  const uniqueReasons = [...new Set(candidateReasons)];

  return uniqueReasons.length > 0
    ? `No legal background top-off window: ${uniqueReasons.join(", ")}.`
    : "No legal background top-off window was available.";
}

function slotForTopOffExplanation(
  backgroundTask: TopOffTaskType,
  shiftBlock: TopOffShiftBlock,
): TopOffSlot {
  return {
    id: `explain:${shiftBlock.date}:${shiftBlock.id}`,
    date: shiftBlock.date,
    scheduleDayId: shiftBlock.scheduleDayId,
    shiftBlockId: shiftBlock.id,
    shiftTemplateId: shiftBlock.shiftTemplateId,
    shiftCategory: shiftBlock.shiftCategory,
    shiftName: shiftBlock.name,
    paidHours: shiftBlock.paidHours,
    taskTypeId: backgroundTask.id,
    slotIndex: 1,
    requirementLevel: "OPTIONAL",
    startMinute: shiftBlock.startMinute,
    endMinute: shiftBlock.endMinute,
    minStaff: 0,
    requiredStaff: 1,
    requiredSkillIds: [],
    eligibleEmployeeIds: [],
    canBePulledForClinic: true,
    protectedFromPull: false,
    taskType: backgroundTask,
    source: GENERATED_BACKGROUND_TOP_OFF_SOURCE,
    currentAssignmentCount: 0,
  };
}

async function createTopOffSlot(input: {
  shiftBlock: TopOffShiftBlock;
  taskTypeId: string;
}) {
  const existingMax = await getDb().taskSlot.aggregate({
    where: {
      scheduleDayId: input.shiftBlock.scheduleDayId,
      shiftBlockId: input.shiftBlock.id,
      taskTypeId: input.taskTypeId,
    },
    _max: { slotIndex: true },
  });
  const slotIndex = (existingMax._max.slotIndex ?? 0) + 1;

  return getDb().taskSlot.create({
    data: {
      scheduleDayId: input.shiftBlock.scheduleDayId,
      shiftBlockId: input.shiftBlock.id,
      taskTypeId: input.taskTypeId,
      slotIndex,
      label: `Background top-off #${slotIndex}`,
      startMinute: input.shiftBlock.startMinute,
      endMinute: input.shiftBlock.endMinute,
      minStaff: 0,
      requiredStaff: 1,
      requirementLevel: "OPTIONAL",
      source: GENERATED_BACKGROUND_TOP_OFF_SOURCE,
      status: "OPEN",
      notes: "Generated to satisfy weekly BG/background minimums or expected weekly hours.",
    },
  });
}

async function assignTopOffSlot(input: {
  slot: TopOffSlot;
  employee: TopOffEmployee;
  state: TopOffEmployeeState;
  allAssignments: ExistingAssignment[];
  actorEmployeeId?: string | null;
}) {
  await getDb().assignment.create({
    data: {
      taskSlotId: input.slot.id,
      employeeId: input.employee.id,
      source: AssignmentSource.GENERATED,
      locked: false,
      assignedByEmployeeId: input.actorEmployeeId ?? undefined,
      notes: "Generated background top-off.",
    },
  });
  await getDb().taskSlot.update({
    where: { id: input.slot.id },
    data: { status: "FILLED", notes: null },
  });

  const shiftKey = shiftKeyForSlot(input.slot);

  if (!input.state.shiftKeys.has(shiftKey)) {
    input.state.shiftKeys.add(shiftKey);
    input.state.hours += input.slot.paidHours ?? 0;
  }

  input.state.backgroundAssignments += 1;
  input.allAssignments.push({
    slotId: input.slot.id,
    employeeId: input.employee.id,
    date: input.slot.date,
    taskTypeId: input.slot.taskTypeId,
    startMinute: input.slot.startMinute,
    endMinute: input.slot.endMinute,
    shiftBlockId: input.slot.shiftBlockId,
    shiftCategory: input.slot.shiftCategory,
    paidHours: input.slot.paidHours,
    isPatientFacing: input.slot.taskType.isPatientFacing,
    isClinical: input.slot.taskType.isClinical,
    isBackground: input.slot.taskType.isBackground,
    isFloat: input.slot.taskType.isFloat,
    isEndoscopy: input.slot.taskType.isEndoscopy,
    canBePulledForClinic: input.slot.canBePulledForClinic,
    protectedFromPull: input.slot.protectedFromPull,
    locked: false,
  });
}

function compareTopOffSlots(left: TopOffSlot, right: TopOffSlot) {
  const leftSourcePriority =
    left.source === GENERATED_BACKGROUND_TOP_OFF_SOURCE ? 1 : 0;
  const rightSourcePriority =
    right.source === GENERATED_BACKGROUND_TOP_OFF_SOURCE ? 1 : 0;

  return (
    leftSourcePriority - rightSourcePriority ||
    left.date.localeCompare(right.date) ||
    (left.startMinute ?? 0) - (right.startMinute ?? 0) ||
    left.taskType.name.localeCompare(right.taskType.name) ||
    left.id.localeCompare(right.id)
  );
}

function weekdayPreferenceScore(employee: TopOffEmployee, shiftBlock: TopOffShiftBlock) {
  const weekday = new Date(`${shiftBlock.date}T00:00:00.000Z`).getUTCDay();

  return employee.workPattern?.extraHourWeekdays?.includes(weekday) ? 1 : 0;
}

function shiftKeyForSlot(slot: Pick<TopOffSlot, "date" | "shiftBlockId">) {
  return `${slot.date}:${slot.shiftBlockId ?? "none"}`;
}

function toWorkPatternAssignments(assignments: ExistingAssignment[]) {
  return assignments.map((assignment) => ({
    date: assignment.date,
    shiftBlockId: assignment.shiftBlockId ?? assignment.slotId,
    shiftCategory: assignment.shiftCategory,
    startMinute: assignment.startMinute ?? 0,
    endMinute: assignment.endMinute ?? 24 * 60,
    paidHours: assignment.paidHours ?? 0,
  }));
}
