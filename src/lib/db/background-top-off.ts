import {
  AssignmentSource,
  AssignmentStatus,
  TaskSlotStatus,
  type Prisma,
} from "@prisma/client";
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
import { eastonTargetPatternCodeForDate } from "@/lib/schedule/easton-model";
import { isSchedulingRequiredEmployee } from "@/lib/schedule/employees";
import { buildJulyWeekSkeletons } from "@/lib/schedule/july-week-planner";
import { isCanonicalBgTaskType } from "@/lib/schedule/bg-role";
import { parseIsoDate, toIsoDate } from "@/lib/utils/date";

export const GENERATED_BACKGROUND_TOP_OFF_SOURCE =
  "GENERATED_BACKGROUND_TOP_OFF";

type TopOffEmployee = SchedulerEmployee & {
  expectedHours: number;
  requiredBackgroundAssignments: number;
  targetTaskCounts?: Record<string, number>;
};

type TopOffTaskType = SchedulerTaskType & {
  isBackground: boolean;
};

type TopOffSlot = SchedulerTaskSlot & {
  scheduleDayId: string;
  taskType: TopOffTaskType;
  currentAssignmentCount: number;
  source: string;
  assignments: TopOffAssignment[];
};

type TopOffAssignment = {
  id: string;
  employeeId: string;
  locked: boolean;
  source?: AssignmentSource | string | null;
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

export type LiteralBgRoleMixDiagnostic = {
  employeeId: string;
  employeeName: string;
  targetRoleCounts: Record<string, number>;
  assignedRoleCounts: Record<string, number>;
  literalBgRequired: number;
  literalBgAssigned: number;
  literalBgMissing: number;
  literalBgExcess: number;
  convertibleAssignments: Array<{
    slotId: string;
    taskTypeCode: string;
    taskTypeName: string;
    shiftName: string | null | undefined;
  }>;
  swapConclusion: string;
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
  roleMixSwapsMade: number;
  roleMixSwapDetails: Array<{
    missingEmployeeId: string;
    missingEmployeeName: string;
    excessEmployeeId: string;
    excessEmployeeName: string;
    movedRoleCode: string;
    backgroundShiftName: string | null | undefined;
    displacedShiftName: string | null | undefined;
  }>;
  roleMixDiagnostics: LiteralBgRoleMixDiagnostic[];
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
  const eastonTargetPatternCode = eastonTargetPatternCodeForDate(input.endDate);
  const summary: BackgroundTopOffSummary = {
    startDate: input.startDate,
    endDate: input.endDate,
    slotsCreated: 0,
    assignmentsCreated: 0,
    employeesCompleted: 0,
    employeesMissingBackground: [],
    roleMixSwapsMade: 0,
    roleMixSwapDetails: [],
    roleMixDiagnostics: [],
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
      where: { status: "ACTIVE", scheduleEligible: true },
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
                source: true,
              },
            },
          },
        },
      },
    }),
    db.employeeScheduleTarget.findMany({
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
  ]);

  if (!backgroundTaskType) {
    summary.configurationWarnings.push(
      "Cannot top off weekly BG/hour targets because the BACKGROUND task type is missing or inactive.",
    );
    return summary;
  }

  let employees = rawEmployees
    .filter(isSchedulingRequiredEmployee)
    .map((employee) =>
      toTopOffEmployee(
        employee,
        findEastonTargetForEmployee(employee, scheduleTargets),
      ),
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
        assignments: slot.assignments,
      };
      taskSlots.push(topOffSlot);

      for (const assignment of slot.assignments) {
        const state = states.get(assignment.employeeId);
        const shiftKey = shiftKeyForSlot(topOffSlot);

        if (state && !state.shiftKeys.has(shiftKey)) {
          state.shiftKeys.add(shiftKey);
          state.hours += topOffSlot.paidHours ?? 0;
        }

        if (state && isCanonicalBgTaskType(topOffSlot.taskType)) {
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

  const weekSkeletons = buildJulyWeekSkeletons({
    employees,
    shiftBlocks,
  });
  employees = employees.map((employee) => ({
    ...employee,
    julyWeekSkeleton: weekSkeletons.get(employee.id) ?? null,
  }));

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

      if (
        state.backgroundAssignments < employee.requiredBackgroundAssignments &&
        state.hours >= employee.expectedHours
      ) {
        const conversion = await convertFlexibleAssignmentToBackground({
          employee,
          taskSlots,
          shiftBlocks,
          backgroundTask,
          allAssignments,
          state,
          actorEmployeeId: input.actorEmployeeId,
        });

        if (conversion.converted) {
          summary.slotsCreated += conversion.slotCreated ? 1 : 0;
          summary.assignmentsCreated += 1;
          progress = true;
          continue;
        }

        const swap = await swapLiteralBackgroundFromExcessEmployee({
          missingEmployee: employee,
          employees,
          states,
          hasMissingWorkPatternByEmployeeId,
          taskSlots,
          allAssignments,
          actorEmployeeId: input.actorEmployeeId,
        });

        if (swap.swapped) {
          summary.roleMixSwapsMade += 1;
          summary.roleMixSwapDetails.push(swap.detail);
          progress = true;
          continue;
        }
      }

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
        assignments: [],
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

  summary.roleMixDiagnostics = buildLiteralBgRoleMixDiagnostics({
    employees,
    states,
    taskSlots,
    allAssignments,
    hasMissingWorkPatternByEmployeeId,
  });

  for (const employee of employees) {
    const state = states.get(employee.id)!;
    const blockerReason = explainTopOffBlocker({
      employee,
      state,
      hasMissingWorkPattern:
        hasMissingWorkPatternByEmployeeId.get(employee.id) ?? false,
      taskSlots,
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
    targetTaskCounts: jsonNumberRecord(scheduleTarget?.targetTaskCounts),
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
    .filter((slot) => isCanonicalBgTaskType(slot.taskType))
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
          assignments: [],
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

async function convertFlexibleAssignmentToBackground(input: {
  employee: TopOffEmployee;
  taskSlots: TopOffSlot[];
  shiftBlocks: TopOffShiftBlock[];
  backgroundTask: TopOffTaskType;
  allAssignments: ExistingAssignment[];
  state: TopOffEmployeeState;
  actorEmployeeId?: string | null;
}) {
  const candidate = selectBackgroundMinimumConversionCandidate(input);

  if (!candidate) {
    return { converted: false, slotCreated: false };
  }

  let backgroundSlot = candidate.backgroundSlot;
  let slotCreated = false;

  if (!backgroundSlot) {
    const created = await createTopOffSlot({
      shiftBlock: candidate.shiftBlock,
      taskTypeId: input.backgroundTask.id,
    });
    backgroundSlot = {
      id: created.id,
      date: candidate.shiftBlock.date,
      scheduleDayId: candidate.shiftBlock.scheduleDayId,
      shiftBlockId: candidate.shiftBlock.id,
      shiftTemplateId: candidate.shiftBlock.shiftTemplateId,
      shiftCategory: candidate.shiftBlock.shiftCategory,
      shiftName: candidate.shiftBlock.name,
      paidHours: candidate.shiftBlock.paidHours,
      taskTypeId: input.backgroundTask.id,
      slotIndex: created.slotIndex,
      requirementLevel: "OPTIONAL",
      startMinute: candidate.shiftBlock.startMinute,
      endMinute: candidate.shiftBlock.endMinute,
      minStaff: 0,
      requiredStaff: 1,
      requiredSkillIds: [],
      eligibleEmployeeIds: [],
      canBePulledForClinic: true,
      protectedFromPull: false,
      taskType: input.backgroundTask,
      source: GENERATED_BACKGROUND_TOP_OFF_SOURCE,
      currentAssignmentCount: 0,
      assignments: [],
    };
    input.taskSlots.push(backgroundSlot);
    slotCreated = true;
  }

  const assignment = await getDb().$transaction(async (tx) => {
    await tx.assignment.update({
      where: { id: candidate.assignment.id },
      data: {
        status: AssignmentStatus.REMOVED,
        removedAt: new Date(),
      },
    });

    const createdAssignment = await tx.assignment.create({
      data: {
        taskSlotId: backgroundSlot.id,
        employeeId: input.employee.id,
        source: AssignmentSource.GENERATED,
        locked: false,
        assignedByEmployeeId: input.actorEmployeeId ?? undefined,
        notes:
          "Generated by converting flexible work to satisfy weekly literal BG minimum.",
      },
    });

    await tx.taskSlot.update({
      where: { id: candidate.sourceSlot.id },
      data: {
        status:
          candidate.sourceSlot.currentAssignmentCount - 1 >=
          (candidate.sourceSlot.requiredStaff ?? 1)
            ? TaskSlotStatus.FILLED
            : TaskSlotStatus.OPEN,
        notes:
          "Generated assignment converted to literal BG to satisfy employee weekly BG minimum.",
      },
    });

    await tx.taskSlot.update({
      where: { id: backgroundSlot.id },
      data: {
        status: TaskSlotStatus.FILLED,
        notes: null,
      },
    });

    return createdAssignment;
  });

  candidate.sourceSlot.currentAssignmentCount = Math.max(
    0,
    candidate.sourceSlot.currentAssignmentCount - 1,
  );
  candidate.sourceSlot.assignments = candidate.sourceSlot.assignments.filter(
    (item) => item.id !== candidate.assignment.id,
  );
  backgroundSlot.currentAssignmentCount += 1;
  backgroundSlot.assignments.push({
    id: assignment.id,
    employeeId: input.employee.id,
    locked: false,
    source: AssignmentSource.GENERATED,
  });
  removeExistingAssignment(input.allAssignments, {
    employeeId: input.employee.id,
    slotId: candidate.sourceSlot.id,
  });
  input.allAssignments.push({
    slotId: backgroundSlot.id,
    employeeId: input.employee.id,
    date: backgroundSlot.date,
    taskTypeId: backgroundSlot.taskTypeId,
    startMinute: backgroundSlot.startMinute,
    endMinute: backgroundSlot.endMinute,
    shiftBlockId: backgroundSlot.shiftBlockId,
    shiftCategory: backgroundSlot.shiftCategory,
    paidHours: backgroundSlot.paidHours,
    isPatientFacing: backgroundSlot.taskType.isPatientFacing,
    isClinical: backgroundSlot.taskType.isClinical,
    isBackground: backgroundSlot.taskType.isBackground,
    isFloat: backgroundSlot.taskType.isFloat,
    isEndoscopy: backgroundSlot.taskType.isEndoscopy,
    canBePulledForClinic: backgroundSlot.canBePulledForClinic,
    protectedFromPull: backgroundSlot.protectedFromPull,
    locked: false,
  });
  input.state.backgroundAssignments += 1;

  return { converted: true, slotCreated };
}

async function swapLiteralBackgroundFromExcessEmployee(input: {
  missingEmployee: TopOffEmployee;
  employees: TopOffEmployee[];
  states: Map<string, TopOffEmployeeState>;
  hasMissingWorkPatternByEmployeeId: Map<string, boolean>;
  taskSlots: TopOffSlot[];
  allAssignments: ExistingAssignment[];
  actorEmployeeId?: string | null;
}) {
  const candidate = selectLiteralBgSwapCandidate(input);

  if (!candidate) {
    return { swapped: false as const };
  }

  await getDb().$transaction(async (tx) => {
    await tx.assignment.update({
      where: { id: candidate.missingAssignment.id },
      data: {
        taskSlotId: candidate.backgroundSlot.id,
        assignedByEmployeeId: input.actorEmployeeId ?? undefined,
        notes:
          "Generated role-mix swap moved this employee into literal BG to satisfy weekly BG minimum.",
      },
    });

    await tx.assignment.update({
      where: { id: candidate.backgroundAssignment.id },
      data: {
        taskSlotId: candidate.sourceSlot.id,
        assignedByEmployeeId: input.actorEmployeeId ?? undefined,
        notes:
          "Generated role-mix swap moved excess BG employee into displaced role.",
      },
    });
  });

  candidate.sourceSlot.assignments = candidate.sourceSlot.assignments
    .filter((assignment) => assignment.id !== candidate.missingAssignment.id)
    .concat({
      ...candidate.backgroundAssignment,
      employeeId: candidate.excessEmployee.id,
    });
  candidate.backgroundSlot.assignments = candidate.backgroundSlot.assignments
    .filter((assignment) => assignment.id !== candidate.backgroundAssignment.id)
    .concat({
      ...candidate.missingAssignment,
      employeeId: candidate.missingEmployee.id,
    });

  removeExistingAssignment(input.allAssignments, {
    employeeId: candidate.missingEmployee.id,
    slotId: candidate.sourceSlot.id,
  });
  removeExistingAssignment(input.allAssignments, {
    employeeId: candidate.excessEmployee.id,
    slotId: candidate.backgroundSlot.id,
  });
  input.allAssignments.push(
    toExistingAssignmentForSlot(
      candidate.backgroundSlot,
      candidate.missingEmployee.id,
      candidate.missingAssignment.locked,
    ),
    toExistingAssignmentForSlot(
      candidate.sourceSlot,
      candidate.excessEmployee.id,
      candidate.backgroundAssignment.locked,
    ),
  );

  const missingState = input.states.get(candidate.missingEmployee.id);
  const excessState = input.states.get(candidate.excessEmployee.id);

  if (missingState) {
    missingState.backgroundAssignments += 1;
  }

  if (excessState) {
    excessState.backgroundAssignments = Math.max(
      0,
      excessState.backgroundAssignments - 1,
    );
  }

  return {
    swapped: true as const,
    detail: {
      missingEmployeeId: candidate.missingEmployee.id,
      missingEmployeeName: candidate.missingEmployee.fullName,
      excessEmployeeId: candidate.excessEmployee.id,
      excessEmployeeName: candidate.excessEmployee.fullName,
      movedRoleCode: candidate.sourceSlot.taskType.code,
      backgroundShiftName: candidate.backgroundSlot.shiftName,
      displacedShiftName: candidate.sourceSlot.shiftName,
    },
  };
}

export function selectLiteralBgSwapCandidate(input: {
  missingEmployee: TopOffEmployee;
  employees: TopOffEmployee[];
  states: Map<string, TopOffEmployeeState>;
  hasMissingWorkPatternByEmployeeId?: Map<string, boolean>;
  taskSlots: TopOffSlot[];
  allAssignments: ExistingAssignment[];
}) {
  const missingState = input.states.get(input.missingEmployee.id);

  if (
    !missingState ||
    missingState.backgroundAssignments >=
      input.missingEmployee.requiredBackgroundAssignments ||
    input.hasMissingWorkPatternByEmployeeId?.get(input.missingEmployee.id)
  ) {
    return null;
  }

  const candidates = input.taskSlots
    .flatMap((sourceSlot) => {
      const missingAssignment = sourceSlot.assignments.find(
        (assignment) => assignment.employeeId === input.missingEmployee.id,
      );

      if (
        !missingAssignment ||
        !canUseSourceSlotForLiteralBgSwap(sourceSlot, missingAssignment)
      ) {
        return [];
      }

      return input.taskSlots.flatMap((backgroundSlot) => {
        if (!isCanonicalBgTaskType(backgroundSlot.taskType)) {
          return [];
        }

        return backgroundSlot.assignments.flatMap((backgroundAssignment) => {
          const excessEmployee = input.employees.find(
            (employee) => employee.id === backgroundAssignment.employeeId,
          );
          const excessState = excessEmployee
            ? input.states.get(excessEmployee.id)
            : null;

          if (
            !excessEmployee ||
            !excessState ||
            excessEmployee.id === input.missingEmployee.id ||
            input.hasMissingWorkPatternByEmployeeId?.get(excessEmployee.id) ||
            excessState.backgroundAssignments <=
              excessEmployee.requiredBackgroundAssignments ||
            !canDonateLiteralBgForSwap(backgroundSlot, backgroundAssignment)
          ) {
            return [];
          }

          const blocker = literalBgSwapBlocker({
            missingEmployee: input.missingEmployee,
            missingState,
            missingAssignment,
            excessEmployee,
            excessState,
            backgroundAssignment,
            sourceSlot,
            backgroundSlot,
            allAssignments: input.allAssignments,
          });

          if (blocker) {
            return [];
          }

          return [
            {
              missingEmployee: input.missingEmployee,
              missingAssignment,
              sourceSlot,
              excessEmployee,
              backgroundAssignment,
              backgroundSlot,
            },
          ];
        });
      });
    })
    .sort(compareLiteralBgSwapCandidates);

  return candidates[0] ?? null;
}

function literalBgSwapBlocker(input: {
  missingEmployee: TopOffEmployee;
  missingState: TopOffEmployeeState;
  missingAssignment: TopOffAssignment;
  excessEmployee: TopOffEmployee;
  excessState: TopOffEmployeeState;
  backgroundAssignment: TopOffAssignment;
  sourceSlot: TopOffSlot;
  backgroundSlot: TopOffSlot;
  allAssignments: ExistingAssignment[];
}) {
  const baseAssignments = withoutExistingAssignments(input.allAssignments, [
    {
      employeeId: input.missingEmployee.id,
      slotId: input.sourceSlot.id,
    },
    {
      employeeId: input.excessEmployee.id,
      slotId: input.backgroundSlot.id,
    },
  ]);
  const missingIntoBg = toExistingAssignmentForSlot(
    input.backgroundSlot,
    input.missingEmployee.id,
    input.missingAssignment.locked,
  );
  const excessIntoSource = toExistingAssignmentForSlot(
    input.sourceSlot,
    input.excessEmployee.id,
    input.backgroundAssignment.locked,
  );
  const missingRejections = getConstraintRejections(
    input.missingEmployee,
    input.backgroundSlot.taskType,
    input.backgroundSlot,
    baseAssignments,
  );

  if (missingRejections.length > 0) {
    return `${input.missingEmployee.fullName} cannot take literal BG: ${missingRejections.join(", ")}`;
  }

  const excessRejections = getConstraintRejections(
    input.excessEmployee,
    input.sourceSlot.taskType,
    input.sourceSlot,
    [...baseAssignments, missingIntoBg],
  );

  if (excessRejections.length > 0) {
    return `${input.excessEmployee.fullName} cannot take ${input.sourceSlot.taskType.name}: ${excessRejections.join(", ")}`;
  }

  const swappedAssignments = [
    ...baseAssignments,
    missingIntoBg,
    excessIntoSource,
  ];
  const missingHours = uniqueEmployeeScheduledHours(
    swappedAssignments,
    input.missingEmployee.id,
  );
  const excessHours = uniqueEmployeeScheduledHours(
    swappedAssignments,
    input.excessEmployee.id,
  );

  if (missingHours !== input.missingState.hours) {
    return `${input.missingEmployee.fullName} would change from ${input.missingState.hours} to ${missingHours} hours`;
  }

  if (excessHours !== input.excessState.hours) {
    return `${input.excessEmployee.fullName} would change from ${input.excessState.hours} to ${excessHours} hours`;
  }

  const missingPattern = validateEmployeeWeekPattern({
    employee: input.missingEmployee,
    assignments: toWorkPatternAssignments(
      swappedAssignments.filter(
        (assignment) => assignment.employeeId === input.missingEmployee.id,
      ),
    ),
  });

  if (
    !missingPattern.hasRequiredSaturday ||
    missingPattern.missingExtraHourWeekdays.length > 0
  ) {
    return `${input.missingEmployee.fullName} would lose a required work-pattern shift`;
  }

  const excessPattern = validateEmployeeWeekPattern({
    employee: input.excessEmployee,
    assignments: toWorkPatternAssignments(
      swappedAssignments.filter(
        (assignment) => assignment.employeeId === input.excessEmployee.id,
      ),
    ),
  });

  if (
    !excessPattern.hasRequiredSaturday ||
    excessPattern.missingExtraHourWeekdays.length > 0
  ) {
    return `${input.excessEmployee.fullName} would lose a required work-pattern shift`;
  }

  return null;
}

export function buildLiteralBgRoleMixDiagnostics(input: {
  employees: TopOffEmployee[];
  states: Map<string, TopOffEmployeeState>;
  taskSlots: TopOffSlot[];
  allAssignments: ExistingAssignment[];
  hasMissingWorkPatternByEmployeeId?: Map<string, boolean>;
}) {
  const assignedRoleCountsByEmployeeId = assignedRoleCountsByEmployeeIdFromSlots(
    input.taskSlots,
  );

  return input.employees
    .map((employee) => {
      const state = input.states.get(employee.id);
      const assignedRoleCounts =
        assignedRoleCountsByEmployeeId.get(employee.id) ?? {};
      const targetRoleCounts = {
        ...(employee.targetTaskCounts ?? {}),
        BACKGROUND: Math.max(
          employee.requiredBackgroundAssignments,
          employee.targetTaskCounts?.BACKGROUND ?? 0,
        ),
      };
      const literalBgAssigned = assignedRoleCounts.BACKGROUND ?? 0;
      const literalBgRequired = targetRoleCounts.BACKGROUND ?? 0;
      const missing = Math.max(0, literalBgRequired - literalBgAssigned);
      const excess = Math.max(0, literalBgAssigned - literalBgRequired);
      const swap = missing
        ? selectLiteralBgSwapCandidate({
            missingEmployee: employee,
            employees: input.employees,
            states: input.states,
            hasMissingWorkPatternByEmployeeId:
              input.hasMissingWorkPatternByEmployeeId,
            taskSlots: input.taskSlots,
            allAssignments: input.allAssignments,
          })
        : null;

      return {
        employeeId: employee.id,
        employeeName: employee.fullName,
        targetRoleCounts,
        assignedRoleCounts,
        literalBgRequired,
        literalBgAssigned,
        literalBgMissing: missing,
        literalBgExcess: excess,
        convertibleAssignments:
          missing && state
            ? listOwnLiteralBgConversionCandidates({
                employee,
                taskSlots: input.taskSlots,
                allAssignments: input.allAssignments,
              })
            : [],
        swapConclusion: missing
          ? swap
            ? `Feasible swap found with ${swap.excessEmployee.fullName}: ${swap.sourceSlot.taskType.code} <-> literal BG.`
            : `Impossible because ${explainLiteralBgSwapBlockers({
                missingEmployee: employee,
                employees: input.employees,
                states: input.states,
                hasMissingWorkPatternByEmployeeId:
                  input.hasMissingWorkPatternByEmployeeId,
                taskSlots: input.taskSlots,
                allAssignments: input.allAssignments,
              })}`
          : excess > 0
            ? `Excess literal BG available: ${excess}.`
            : "Literal BG target met.",
      } satisfies LiteralBgRoleMixDiagnostic;
    })
    .filter(
      (diagnostic) =>
        diagnostic.literalBgRequired > 0 || diagnostic.literalBgAssigned > 0,
    );
}

function canUseSourceSlotForLiteralBgSwap(
  slot: TopOffSlot,
  assignment: TopOffAssignment,
) {
  if (isCanonicalBgTaskType(slot.taskType)) {
    return false;
  }

  if (slot.taskType.isEndoscopy || slot.shiftCategory === "ENDO") {
    return false;
  }

  if (slot.protectedFromPull || slot.source === "MANUAL") {
    return false;
  }

  return isMovableTopOffAssignment(assignment);
}

function canDonateLiteralBgForSwap(
  slot: TopOffSlot,
  assignment: TopOffAssignment,
) {
  if (!isCanonicalBgTaskType(slot.taskType)) {
    return false;
  }

  if (slot.protectedFromPull || slot.source === "MANUAL") {
    return false;
  }

  return isMovableTopOffAssignment(assignment);
}

function isMovableTopOffAssignment(assignment: TopOffAssignment) {
  return (
    !assignment.locked &&
    (!assignment.source ||
      assignment.source === AssignmentSource.GENERATED ||
      assignment.source === AssignmentSource.COVERAGE_REPLACEMENT)
  );
}

function compareLiteralBgSwapCandidates(
  left: NonNullable<ReturnType<typeof selectLiteralBgSwapCandidate>>,
  right: NonNullable<ReturnType<typeof selectLiteralBgSwapCandidate>>,
) {
  return (
    conversionPenalty(left.sourceSlot) - conversionPenalty(right.sourceSlot) ||
    left.backgroundSlot.date.localeCompare(right.backgroundSlot.date) ||
    (left.backgroundSlot.startMinute ?? 0) -
      (right.backgroundSlot.startMinute ?? 0) ||
    left.excessEmployee.fullName.localeCompare(right.excessEmployee.fullName) ||
    left.sourceSlot.date.localeCompare(right.sourceSlot.date) ||
    (left.sourceSlot.startMinute ?? 0) - (right.sourceSlot.startMinute ?? 0) ||
    left.sourceSlot.taskType.name.localeCompare(right.sourceSlot.taskType.name)
  );
}

function listOwnLiteralBgConversionCandidates(input: {
  employee: TopOffEmployee;
  taskSlots: TopOffSlot[];
  allAssignments: ExistingAssignment[];
}) {
  return input.taskSlots
    .filter((slot) => {
      const assignment = slot.assignments.find(
        (candidate) => candidate.employeeId === input.employee.id,
      );

      return assignment && canUseSourceSlotForLiteralBgSwap(slot, assignment);
    })
    .filter((slot) => {
      const simulatedAssignments = withoutExistingAssignment(input.allAssignments, {
        employeeId: input.employee.id,
        slotId: slot.id,
      });
      const rejections = getConstraintRejections(
        input.employee,
        {
          id: "diagnostic-background",
          code: "BACKGROUND",
          name: "Background",
          requiredSkillIds: [],
          isBackground: true,
        },
        {
          ...slot,
          taskTypeId: "diagnostic-background",
        },
        simulatedAssignments,
      );

      return rejections.length === 0;
    })
    .map((slot) => ({
      slotId: slot.id,
      taskTypeCode: slot.taskType.code,
      taskTypeName: slot.taskType.name,
      shiftName: slot.shiftName,
    }));
}

function explainLiteralBgSwapBlockers(input: {
  missingEmployee: TopOffEmployee;
  employees: TopOffEmployee[];
  states: Map<string, TopOffEmployeeState>;
  hasMissingWorkPatternByEmployeeId?: Map<string, boolean>;
  taskSlots: TopOffSlot[];
  allAssignments: ExistingAssignment[];
}) {
  if (input.hasMissingWorkPatternByEmployeeId?.get(input.missingEmployee.id)) {
    return "the employee is still missing a hard work-pattern shift.";
  }

  const excessEmployees = input.employees.filter((employee) => {
    const state = input.states.get(employee.id);

    return (
      employee.id !== input.missingEmployee.id &&
      state &&
      state.backgroundAssignments > employee.requiredBackgroundAssignments &&
      !input.hasMissingWorkPatternByEmployeeId?.get(employee.id)
    );
  });

  if (excessEmployees.length === 0) {
    return "no employee has excess literal BG to donate.";
  }

  const reasons: string[] = [];

  for (const sourceSlot of input.taskSlots) {
    const missingAssignment = sourceSlot.assignments.find(
      (assignment) => assignment.employeeId === input.missingEmployee.id,
    );

    if (
      !missingAssignment ||
      !canUseSourceSlotForLiteralBgSwap(sourceSlot, missingAssignment)
    ) {
      continue;
    }

    for (const backgroundSlot of input.taskSlots.filter((slot) =>
      isCanonicalBgTaskType(slot.taskType),
    )) {
      for (const backgroundAssignment of backgroundSlot.assignments) {
        const excessEmployee = excessEmployees.find(
          (employee) => employee.id === backgroundAssignment.employeeId,
        );

        if (
          !excessEmployee ||
          !canDonateLiteralBgForSwap(backgroundSlot, backgroundAssignment)
        ) {
          continue;
        }

        const excessState = input.states.get(excessEmployee.id);

        if (!excessState) {
          continue;
        }

        const blocker = literalBgSwapBlocker({
          missingEmployee: input.missingEmployee,
          missingState: input.states.get(input.missingEmployee.id)!,
          missingAssignment,
          excessEmployee,
          excessState,
          backgroundAssignment,
          sourceSlot,
          backgroundSlot,
          allAssignments: input.allAssignments,
        });

        if (blocker) {
          reasons.push(blocker);
        }
      }
    }
  }

  return reasons.length > 0
    ? [...new Set(reasons)].slice(0, 4).join("; ")
    : "no movable non-BG assignment could be paired with excess literal BG.";
}

function assignedRoleCountsByEmployeeIdFromSlots(taskSlots: TopOffSlot[]) {
  const countsByEmployeeId = new Map<string, Record<string, number>>();

  for (const slot of taskSlots) {
    for (const assignment of slot.assignments) {
      const counts = countsByEmployeeId.get(assignment.employeeId) ?? {};
      counts[slot.taskType.code] = (counts[slot.taskType.code] ?? 0) + 1;
      countsByEmployeeId.set(assignment.employeeId, counts);
    }
  }

  return countsByEmployeeId;
}

export function selectBackgroundMinimumConversionCandidate(input: {
  employee: TopOffEmployee;
  taskSlots: TopOffSlot[];
  shiftBlocks: TopOffShiftBlock[];
  backgroundTask: TopOffTaskType;
  allAssignments: ExistingAssignment[];
}) {
  const candidates = input.taskSlots
    .flatMap((sourceSlot) => {
      const assignment = sourceSlot.assignments.find(
        (item) => item.employeeId === input.employee.id,
      );

      if (!assignment || !canConvertSourceSlotToBackground(sourceSlot, assignment)) {
        return [];
      }

      const shiftBlock = input.shiftBlocks.find(
        (block) => block.id === sourceSlot.shiftBlockId,
      );

      if (!shiftBlock) {
        return [];
      }

      const simulatedAssignments = withoutExistingAssignment(input.allAssignments, {
        employeeId: input.employee.id,
        slotId: sourceSlot.id,
      });
      const backgroundSlot =
        findOpenBackgroundSlotOnShift({
          sourceSlot,
          taskSlots: input.taskSlots,
        }) ?? null;
      const candidateSlot =
        backgroundSlot ?? slotForTopOffExplanation(input.backgroundTask, shiftBlock);
      const rejectionReasons = getConstraintRejections(
        input.employee,
        input.backgroundTask,
        candidateSlot,
        simulatedAssignments,
      );

      if (rejectionReasons.length > 0) {
        return [];
      }

      return [
        {
          sourceSlot,
          assignment,
          shiftBlock,
          backgroundSlot,
        },
      ];
    })
    .sort((left, right) => compareConversionCandidates(left.sourceSlot, right.sourceSlot));

  return candidates[0] ?? null;
}

function canConvertSourceSlotToBackground(
  slot: TopOffSlot,
  assignment: TopOffAssignment,
) {
  if (isCanonicalBgTaskType(slot.taskType)) {
    return false;
  }

  if (slot.taskType.isEndoscopy || slot.shiftCategory === "ENDO") {
    return false;
  }

  if (
    !isMovableTopOffAssignment(assignment) ||
    slot.source === "MANUAL" ||
    slot.protectedFromPull
  ) {
    return false;
  }

  if (
    slot.requirementLevel === "REQUIRED" &&
    slot.currentAssignmentCount <= (slot.requiredStaff ?? 1)
  ) {
    return false;
  }

  return true;
}

function explainBackgroundConversionBlockers(input: {
  employee: TopOffEmployee;
  taskSlots: TopOffSlot[];
  shiftBlocks: TopOffShiftBlock[];
  backgroundTask: TopOffTaskType;
  allAssignments: ExistingAssignment[];
}) {
  const assignedSlots = input.taskSlots.filter((slot) =>
    slot.assignments.some((assignment) => assignment.employeeId === input.employee.id),
  );

  if (assignedSlots.length === 0) {
    return "BG minimum is unmet, but the employee has no assignments that can be converted to BG.";
  }

  const reasons = assignedSlots.map((slot) => {
    const assignment = slot.assignments.find(
      (item) => item.employeeId === input.employee.id,
    );

    if (!assignment) {
      return `${slot.shiftName}: assignment was not found.`;
    }

    if (isCanonicalBgTaskType(slot.taskType)) {
      return `${slot.shiftName}: already literal BG.`;
    }

    if (slot.taskType.isEndoscopy || slot.shiftCategory === "ENDO") {
      return `${slot.shiftName}: Endoscopy/Saturday hard assignment is preserved.`;
    }

    if (assignment.locked || slot.source === "MANUAL") {
      return `${slot.shiftName}: locked/manual assignment is preserved.`;
    }

    if (slot.protectedFromPull) {
      return `${slot.shiftName}: protected assignment is preserved.`;
    }

    if (
      slot.requirementLevel === "REQUIRED" &&
      slot.currentAssignmentCount <= (slot.requiredStaff ?? 1)
    ) {
      return `${slot.shiftName}: ${slot.taskType.name} is required coverage.`;
    }

    const shiftBlock = input.shiftBlocks.find(
      (block) => block.id === slot.shiftBlockId,
    );

    if (!shiftBlock) {
      return `${slot.shiftName}: shift block was not found.`;
    }

    const simulatedAssignments = withoutExistingAssignment(input.allAssignments, {
      employeeId: input.employee.id,
      slotId: slot.id,
    });
    const backgroundSlot =
      findOpenBackgroundSlotOnShift({
        sourceSlot: slot,
        taskSlots: input.taskSlots,
      }) ?? slotForTopOffExplanation(input.backgroundTask, shiftBlock);
    const rejections = getConstraintRejections(
      input.employee,
      input.backgroundTask,
      backgroundSlot,
      simulatedAssignments,
    );

    return rejections.length > 0
      ? `${slot.shiftName}: ${rejections.join(", ")}.`
      : `${slot.shiftName}: no conversion was selected.`;
  });

  return `BG minimum is unmet at expected weekly hours; no flexible non-BG assignment could be converted. ${[
    ...new Set(reasons),
  ]
    .slice(0, 6)
    .join(" ")}`;
}

function findOpenBackgroundSlotOnShift(input: {
  sourceSlot: TopOffSlot;
  taskSlots: TopOffSlot[];
}) {
  return input.taskSlots
    .filter((slot) => isCanonicalBgTaskType(slot.taskType))
    .filter((slot) => slot.shiftBlockId === input.sourceSlot.shiftBlockId)
    .filter((slot) => slot.currentAssignmentCount < (slot.requiredStaff ?? 1))
    .sort(compareTopOffSlots)[0];
}

function compareConversionCandidates(left: TopOffSlot, right: TopOffSlot) {
  return (
    conversionPenalty(left) - conversionPenalty(right) ||
    left.date.localeCompare(right.date) ||
    (left.startMinute ?? 0) - (right.startMinute ?? 0) ||
    left.taskType.name.localeCompare(right.taskType.name) ||
    left.id.localeCompare(right.id)
  );
}

function conversionPenalty(slot: TopOffSlot) {
  return (
    (slot.requirementLevel === "REQUIRED" ? 1000 : 0) +
    (slot.taskType.isPatientFacing ? 100 : 0) +
    (slot.taskType.isClinical ? 50 : 0) +
    (slot.taskType.isSkilled ? 20 : 0)
  );
}

function withoutExistingAssignment(
  assignments: ExistingAssignment[],
  input: { employeeId: string; slotId: string },
) {
  const next = [...assignments];
  removeExistingAssignment(next, input);
  return next;
}

function withoutExistingAssignments(
  assignments: ExistingAssignment[],
  removals: Array<{ employeeId: string; slotId: string }>,
) {
  const next = [...assignments];

  for (const removal of removals) {
    removeExistingAssignment(next, removal);
  }

  return next;
}

function removeExistingAssignment(
  assignments: ExistingAssignment[],
  input: { employeeId: string; slotId: string },
) {
  const index = assignments.findIndex(
    (assignment) =>
      assignment.employeeId === input.employeeId && assignment.slotId === input.slotId,
  );

  if (index >= 0) {
    assignments.splice(index, 1);
  }
}

function toExistingAssignmentForSlot(
  slot: TopOffSlot,
  employeeId: string,
  locked: boolean,
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
    isPatientFacing: slot.taskType.isPatientFacing,
    isClinical: slot.taskType.isClinical,
    isBackground: slot.taskType.isBackground,
    isFloat: slot.taskType.isFloat,
    isEndoscopy: slot.taskType.isEndoscopy,
    canBePulledForClinic: slot.canBePulledForClinic,
    protectedFromPull: slot.protectedFromPull,
    locked,
  };
}

function uniqueEmployeeScheduledHours(
  assignments: ExistingAssignment[],
  employeeId: string,
) {
  const hoursByShift = new Map<string, number>();

  for (const assignment of assignments) {
    if (assignment.employeeId !== employeeId) {
      continue;
    }

    hoursByShift.set(
      `${assignment.date}:${assignment.shiftBlockId ?? assignment.slotId}`,
      Number(assignment.paidHours ?? 0),
    );
  }

  return [...hoursByShift.values()].reduce((total, hours) => total + hours, 0);
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
  taskSlots: TopOffSlot[];
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
    return explainBackgroundConversionBlockers({
      employee: input.employee,
      taskSlots: input.taskSlots,
      shiftBlocks: input.shiftBlocks,
      backgroundTask: input.backgroundTask,
      allAssignments: input.allAssignments,
    });
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
    assignments: [],
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
      notes: "Generated to satisfy weekly literal BG minimums or expected weekly hours.",
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
  const assignment = await getDb().assignment.create({
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
  input.slot.assignments.push({
    id: assignment.id,
    employeeId: input.employee.id,
    locked: false,
    source: AssignmentSource.GENERATED,
  });
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

function jsonNumberRecord(value: unknown) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]): [string, number] => [key, Number(item)])
      .filter(
        (entry): entry is [string, number] =>
          Number.isFinite(entry[1]) && entry[1] > 0,
      ),
  );
}
