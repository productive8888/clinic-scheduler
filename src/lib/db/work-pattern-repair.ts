import { AssignmentSource, type Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { findEastonTargetForEmployee } from "@/lib/easton-import/employee-targets";
import { getConstraintRejections, overlaps } from "@/lib/scheduler/constraints";
import type {
  ExistingAssignment,
  SchedulerEmployee,
  SchedulerTaskSlot,
  SchedulerTaskType,
} from "@/lib/scheduler";
import { LEGACY_SHIFT_TEMPLATE_ID } from "@/lib/shifts/legacy";
import {
  getEmployeeWeekPatternRequirement,
  isExtraHourShiftForWeekday,
  uniqueScheduledHours,
  validateEmployeeWeekPattern,
  type WorkPatternAssignmentInput,
} from "@/lib/schedule/work-pattern-requirements";
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
import { parseIsoDate, toIsoDate } from "@/lib/utils/date";

export const GENERATED_WORK_PATTERN_TOP_OFF_SOURCE =
  "GENERATED_WORK_PATTERN_TOP_OFF";

type RepairEmployee = SchedulerEmployee & {
  expectedHours: number;
};

type RepairTaskType = SchedulerTaskType;

type RepairAssignment = {
  id: string;
  employeeId: string;
  source: AssignmentSource;
  locked: boolean;
};

type RepairSlot = SchedulerTaskSlot & {
  scheduleDayId: string;
  status: string;
  source: string;
  taskType: RepairTaskType;
  assignments: RepairAssignment[];
};

type RepairShiftBlock = {
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

export type WorkPatternRepairSummary = {
  startDate: string;
  endDate: string;
  slotsCreated: number;
  assignmentsCreated: number;
  swapsMade: number;
  unresolved: Array<{
    employeeId: string;
    employeeName: string;
    reason: string;
  }>;
};

export async function clearGeneratedWorkPatternTopOffSlots(input: {
  allowedDates: string[];
}) {
  if (input.allowedDates.length === 0) {
    return { slotsRemoved: 0 };
  }

  const result = await getDb().taskSlot.deleteMany({
    where: {
      source: GENERATED_WORK_PATTERN_TOP_OFF_SOURCE,
      scheduleDay: {
        date: { in: input.allowedDates.map(parseIsoDate) },
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

export async function enforceWorkPatternRequirementsForRange(input: {
  startDate: string;
  endDate: string;
  allowedDates: string[];
  mode?: "ALL" | "SATURDAY_ONLY";
  actorEmployeeId?: string | null;
}) {
  const eastonTargetPatternCode = eastonTargetPatternCodeForDate(input.endDate);
  const summary: WorkPatternRepairSummary = {
    startDate: input.startDate,
    endDate: input.endDate,
    slotsCreated: 0,
    assignmentsCreated: 0,
    swapsMade: 0,
    unresolved: [],
  };

  if (input.allowedDates.length === 0) {
    return summary;
  }

  const db = getDb();
  const allowedDates = new Set(input.allowedDates);
  const [backgroundTaskType, rawEmployees, scheduleDays, scheduleTargets] = await Promise.all([
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
                source: true,
                locked: true,
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
    summary.unresolved.push({
      employeeId: "configuration",
      employeeName: "Configuration",
      reason:
        "Cannot create work-pattern top-off slots because BACKGROUND task type is missing or inactive.",
    });
    return summary;
  }

  let employees = rawEmployees
    .filter(isSchedulingRequiredEmployee)
    .map((employee) =>
      toRepairEmployee(
        employee,
        findEastonTargetForEmployee(employee, scheduleTargets),
      ),
    );
  const taskTypes = new Map<string, RepairTaskType>();
  const slots: RepairSlot[] = [];
  const shiftBlocks: RepairShiftBlock[] = [];
  const allAssignments: ExistingAssignment[] = [];

  for (const day of scheduleDays) {
    const date = toIsoDate(day.date);

    if (!allowedDates.has(date) || day.scenario === "CLINIC_CLOSED") {
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
      const taskType: RepairTaskType = {
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
      };
      taskTypes.set(taskType.id, taskType);

      const repairSlot: RepairSlot = {
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
        lockedEmployeeIds: slot.assignments
          .filter((assignment) => assignment.locked)
          .map((assignment) => assignment.employeeId),
        status: slot.status,
        source: slot.source,
        taskType,
        assignments: slot.assignments,
      };
      slots.push(repairSlot);

      for (const assignment of slot.assignments) {
        allAssignments.push(toExistingAssignment(repairSlot, assignment.employeeId, assignment.locked));
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
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

  const backgroundTask: RepairTaskType = {
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

  for (const employee of employees) {
    const requirement = getEmployeeWeekPatternRequirement(employee);

    if (!requirement) {
      continue;
    }

    let validation = validateForEmployee(employee, allAssignments);

    if (!validation.hasRequiredSaturday) {
      const repaired = await satisfySaturdayRequirement({
        employee,
        requirement,
        employeeById,
        slots,
        shiftBlocks,
        allAssignments,
        backgroundTask,
        actorEmployeeId: input.actorEmployeeId,
      });

      if (repaired.type === "ASSIGN") summary.assignmentsCreated += 1;
      if (repaired.type === "CREATE_ASSIGN") {
        summary.assignmentsCreated += 1;
        summary.slotsCreated += 1;
      }
      if (repaired.type === "SWAP") summary.swapsMade += 1;
      if (repaired.type === "NONE") {
        summary.unresolved.push({
          employeeId: employee.id,
          employeeName: employee.fullName,
          reason:
            repaired.reason ??
            "Could not assign required Saturday work-pattern shift.",
        });
      }
    }

    if (input.mode === "SATURDAY_ONLY") {
      continue;
    }

    validation = validateForEmployee(employee, allAssignments);

    for (const weekday of validation.missingExtraHourWeekdays) {
      const repaired = await satisfyExtraHourWeekday({
        employee,
        weekday,
        employeeById,
        slots,
        shiftBlocks,
        allAssignments,
        backgroundTask,
        actorEmployeeId: input.actorEmployeeId,
      });

      if (repaired.type === "ASSIGN") summary.assignmentsCreated += 1;
      if (repaired.type === "CREATE_ASSIGN") {
        summary.assignmentsCreated += 1;
        summary.slotsCreated += 1;
      }
      if (repaired.type === "SWAP") summary.swapsMade += 1;
      if (repaired.type === "NONE") {
        summary.unresolved.push({
          employeeId: employee.id,
          employeeName: employee.fullName,
          reason:
            repaired.reason ??
            (weekday === 1
              ? "Could not assign Monday 0700-1200 or 1300-1800 extra-hour shift."
              : `Could not assign ${weekdayName(weekday)} 0700-1200 extra-hour shift.`),
        });
      }
    }
  }

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "schedule.work_pattern_repair",
    entityType: "ScheduleRange",
    entityId: `${input.startDate}:${input.endDate}`,
    after: summary,
  });

  return summary;
}

function toRepairEmployee(
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
): RepairEmployee {
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
    expectedHours: targetWeeklyHours,
    requiredBackgroundAssignments: getEffectiveRequiredBackgroundAssignments({
      employeeRequiredBackgroundAssignments:
        employee.requiredWeeklyBackgroundShifts,
      scheduleTarget,
    }),
    workPattern,
  });
}

async function satisfyExtraHourWeekday(input: {
  employee: RepairEmployee;
  weekday: number;
  employeeById: Map<string, RepairEmployee>;
  slots: RepairSlot[];
  shiftBlocks: RepairShiftBlock[];
  allAssignments: ExistingAssignment[];
  backgroundTask: RepairTaskType;
  actorEmployeeId?: string | null;
}) {
  const candidates = input.slots
    .filter((slot) =>
      isExtraHourShiftForWeekday(
        {
          date: slot.date,
          startMinute: slot.startMinute ?? 0,
          endMinute: slot.endMinute ?? 24 * 60,
          paidHours: slot.paidHours ?? 0,
        },
        input.weekday,
      ),
    )
    .sort(compareRepairSlots);

  const direct = candidates.find((slot) =>
    canDirectAssign(input.employee, slot, input.allAssignments),
  );

  if (direct) {
    await assignSlot({
      slot: direct,
      employee: input.employee,
      allAssignments: input.allAssignments,
      actorEmployeeId: input.actorEmployeeId,
      notes: "Generated to satisfy required work-pattern extra-hour weekday.",
    });
    return { type: "ASSIGN" as const };
  }

  const moved = await tryMoveIntoOpenCandidate({
    employee: input.employee,
    candidates,
    employeeById: input.employeeById,
    slots: input.slots,
    allAssignments: input.allAssignments,
    notes: "Generated move to satisfy required work-pattern extra-hour weekday.",
  });

  if (moved) {
    return { type: "SWAP" as const };
  }

  const swapped = await trySwapIntoCandidate({
    employee: input.employee,
    candidates,
    employeeById: input.employeeById,
    slots: input.slots,
    allAssignments: input.allAssignments,
    notes: "Generated swap to satisfy required work-pattern extra-hour weekday.",
  });

  if (swapped) {
    return { type: "SWAP" as const };
  }

  const block = input.shiftBlocks
    .filter((shiftBlock) =>
      isExtraHourShiftForWeekday(
        {
          date: shiftBlock.date,
          startMinute: shiftBlock.startMinute,
          endMinute: shiftBlock.endMinute,
          paidHours: shiftBlock.paidHours,
        },
        input.weekday,
      ),
    )
    .filter((shiftBlock) =>
      canDirectAssign(
        input.employee,
        slotForNewBackground(input.backgroundTask, shiftBlock),
        input.allAssignments,
      ),
    )
    .sort(compareShiftBlocks)[0];

  if (!block) {
    return {
      type: "NONE" as const,
      reason: explainRepairBlockers({
        employee: input.employee,
        label:
          input.weekday === 1
            ? "Monday 0700-1200 or 1300-1800 extra-hour shift"
            : `${weekdayName(input.weekday)} 0700-1200 extra-hour shift`,
        candidates,
        matchingShiftBlocks: input.shiftBlocks.filter((shiftBlock) =>
          isExtraHourShiftForWeekday(
            {
              date: shiftBlock.date,
              startMinute: shiftBlock.startMinute,
              endMinute: shiftBlock.endMinute,
              paidHours: shiftBlock.paidHours,
            },
            input.weekday,
          ),
        ),
        backgroundTask: input.backgroundTask,
        allAssignments: input.allAssignments,
      }),
    };
  }

  const slot = await createWorkPatternTopOffSlot({
    shiftBlock: block,
    taskTypeId: input.backgroundTask.id,
  });
  const repairSlot = slotForCreatedBackground(input.backgroundTask, block, slot.id, slot.slotIndex);
  input.slots.push(repairSlot);
  await assignSlot({
    slot: repairSlot,
    employee: input.employee,
    allAssignments: input.allAssignments,
    actorEmployeeId: input.actorEmployeeId,
    notes: "Generated background slot on required extra-hour weekday.",
  });

  return { type: "CREATE_ASSIGN" as const };
}

async function satisfySaturdayRequirement(input: {
  employee: RepairEmployee;
  requirement: NonNullable<ReturnType<typeof getEmployeeWeekPatternRequirement>>;
  employeeById: Map<string, RepairEmployee>;
  slots: RepairSlot[];
  shiftBlocks: RepairShiftBlock[];
  allAssignments: ExistingAssignment[];
  backgroundTask: RepairTaskType;
  actorEmployeeId?: string | null;
}) {
  const candidates = input.slots
    .filter(
      (slot) =>
        slot.date &&
        new Date(`${slot.date}T00:00:00.000Z`).getUTCDay() === 6 &&
        slot.shiftCategory === input.requirement.requiredSaturdayShiftCategory &&
        slot.paidHours === input.requirement.requiredSaturdayPaidHours,
    )
    .sort(compareRepairSlots);
  const direct = candidates.find((slot) =>
    canDirectAssign(input.employee, slot, input.allAssignments),
  );

  if (direct) {
    await assignSlot({
      slot: direct,
      employee: input.employee,
      allAssignments: input.allAssignments,
      actorEmployeeId: input.actorEmployeeId,
      notes: "Generated to satisfy required Saturday work-pattern shift.",
    });
    return { type: "ASSIGN" as const };
  }

  const moved = await tryMoveIntoOpenCandidate({
    employee: input.employee,
    candidates,
    employeeById: input.employeeById,
    slots: input.slots,
    allAssignments: input.allAssignments,
    notes: "Generated move to satisfy required Saturday work-pattern shift.",
  });

  if (moved) {
    return { type: "SWAP" as const };
  }

  const swapped = await trySwapIntoCandidate({
    employee: input.employee,
    candidates,
    employeeById: input.employeeById,
    slots: input.slots,
    allAssignments: input.allAssignments,
    notes: "Generated swap to satisfy required Saturday work-pattern shift.",
  });

  if (swapped) {
    return { type: "SWAP" as const };
  }

  if (input.requirement.requiredSaturdayShiftCategory === "ENDO") {
    return {
      type: "NONE" as const,
      reason:
        "Could not assign required Saturday 0600-1400 Endoscopy shift. Endoscopy work-pattern employees cannot be satisfied with generated Saturday background while Endoscopy coverage is unresolved.",
    };
  }

  const block = input.shiftBlocks
    .filter(
      (shiftBlock) =>
        new Date(`${shiftBlock.date}T00:00:00.000Z`).getUTCDay() === 6 &&
        shiftBlock.shiftCategory === input.requirement.requiredSaturdayShiftCategory &&
        shiftBlock.paidHours === input.requirement.requiredSaturdayPaidHours,
    )
    .filter((shiftBlock) =>
      canDirectAssign(
        input.employee,
        slotForNewBackground(input.backgroundTask, shiftBlock),
        input.allAssignments,
      ),
    )
    .sort(compareShiftBlocks)[0];

  if (!block) {
    return {
      type: "NONE" as const,
      reason: explainRepairBlockers({
        employee: input.employee,
        label: `Saturday ${input.requirement.requiredSaturdayShiftCategory} ${input.requirement.requiredSaturdayPaidHours}h work-pattern shift`,
        candidates,
        matchingShiftBlocks: input.shiftBlocks.filter(
          (shiftBlock) =>
            new Date(`${shiftBlock.date}T00:00:00.000Z`).getUTCDay() === 6 &&
            shiftBlock.shiftCategory === input.requirement.requiredSaturdayShiftCategory &&
            shiftBlock.paidHours === input.requirement.requiredSaturdayPaidHours,
        ),
        backgroundTask: input.backgroundTask,
        allAssignments: input.allAssignments,
      }),
    };
  }

  const slot = await createWorkPatternTopOffSlot({
    shiftBlock: block,
    taskTypeId: input.backgroundTask.id,
  });
  const repairSlot = slotForCreatedBackground(input.backgroundTask, block, slot.id, slot.slotIndex);
  input.slots.push(repairSlot);
  await assignSlot({
    slot: repairSlot,
    employee: input.employee,
    allAssignments: input.allAssignments,
    actorEmployeeId: input.actorEmployeeId,
    notes: "Generated background slot on required Saturday work-pattern shift.",
  });

  return { type: "CREATE_ASSIGN" as const };
}

async function tryMoveIntoOpenCandidate(input: {
  employee: RepairEmployee;
  candidates: RepairSlot[];
  employeeById: Map<string, RepairEmployee>;
  slots: RepairSlot[];
  allAssignments: ExistingAssignment[];
  notes: string;
}) {
  for (const targetSlot of input.candidates) {
    if (targetSlot.assignments.length >= (targetSlot.requiredStaff ?? 1)) {
      continue;
    }

    const overlappingAssignment = findMovableOverlappingAssignment({
      employeeId: input.employee.id,
      targetSlot,
      slots: input.slots,
    });

    if (!overlappingAssignment) {
      continue;
    }

    const oldSlot = input.slots.find(
      (slot) => slot.id === overlappingAssignment.slotId,
    );

    if (!oldSlot) {
      continue;
    }

    const baseAssignments = input.allAssignments.filter(
      (assignment) =>
        !(
          assignment.employeeId === input.employee.id &&
          assignment.slotId === oldSlot.id
        ),
    );

    if (
      getConstraintRejections(
        input.employee,
        targetSlot.taskType,
        targetSlot,
        baseAssignments,
      ).length > 0 ||
      wouldExceedExpectedHours(input.employee, targetSlot, baseAssignments)
    ) {
      continue;
    }

    const replacement = canVacateSlotWithoutRequiredShortage(oldSlot)
      ? null
      : findReplacementForVacatedSlot({
          oldSlot,
          movingEmployeeId: input.employee.id,
          employeeById: input.employeeById,
          assignmentsWithMovedEmployee: [
            ...baseAssignments,
            toExistingAssignment(targetSlot, input.employee.id, false),
          ],
        });

    if (!canVacateSlotWithoutRequiredShortage(oldSlot) && !replacement) {
      continue;
    }

    await getDb().$transaction(async (tx) => {
      await tx.assignment.update({
        where: { id: overlappingAssignment.assignmentId },
        data: { status: "REMOVED", removedAt: new Date() },
      });
      await tx.assignment.create({
        data: {
          taskSlotId: targetSlot.id,
          employeeId: input.employee.id,
          source: "GENERATED",
          notes: input.notes,
        },
      });

      if (replacement) {
        await tx.assignment.create({
          data: {
            taskSlotId: oldSlot.id,
            employeeId: replacement.employee.id,
            source: "GENERATED",
            notes: `${input.notes} Backfilled vacated slot.`,
          },
        });
      }

      await tx.taskSlot.update({
        where: { id: targetSlot.id },
        data: { status: "FILLED", notes: null },
      });
      await tx.taskSlot.update({
        where: { id: oldSlot.id },
        data: {
          status: statusAfterMovingFromSlot(oldSlot, Boolean(replacement)),
          notes: null,
        },
      });
    });

    removeAssignmentFromMemory(input.allAssignments, input.employee.id, oldSlot.id);
    oldSlot.assignments = oldSlot.assignments.filter(
      (assignment) => assignment.id !== overlappingAssignment.assignmentId,
    );
    targetSlot.assignments.push({
      id: `generated:${targetSlot.id}:${input.employee.id}`,
      employeeId: input.employee.id,
      source: "GENERATED",
      locked: false,
    });
    input.allAssignments.push(toExistingAssignment(targetSlot, input.employee.id, false));

    if (replacement) {
      oldSlot.assignments.push({
        id: `generated:${oldSlot.id}:${replacement.employee.id}`,
        employeeId: replacement.employee.id,
        source: "GENERATED",
        locked: false,
      });
      input.allAssignments.push(toExistingAssignment(oldSlot, replacement.employee.id, false));
    }

    return true;
  }

  return false;
}

async function trySwapIntoCandidate(input: {
  employee: RepairEmployee;
  candidates: RepairSlot[];
  employeeById: Map<string, RepairEmployee>;
  slots: RepairSlot[];
  allAssignments: ExistingAssignment[];
  notes: string;
}) {
  for (const targetSlot of input.candidates) {
    const targetAssignment = targetSlot.assignments.find(isMovableAssignment);

    if (!targetAssignment) {
      continue;
    }

    const overlappingAssignment = findMovableOverlappingAssignment({
      employeeId: input.employee.id,
      targetSlot,
      slots: input.slots,
    });

    if (!overlappingAssignment) {
      continue;
    }

    const oldSlot = input.slots.find(
      (slot) => slot.id === overlappingAssignment.slotId,
    );
    const otherEmployee = input.employeeById.get(targetAssignment.employeeId);

    if (!oldSlot || !otherEmployee) {
      continue;
    }

    const baseAssignments = input.allAssignments.filter(
      (assignment) =>
        !(
          assignment.employeeId === input.employee.id &&
          assignment.slotId === oldSlot.id
        ) &&
        !(
          assignment.employeeId === otherEmployee.id &&
          assignment.slotId === targetSlot.id
        ),
    );

    if (
      getConstraintRejections(
        input.employee,
        targetSlot.taskType,
        targetSlot,
        baseAssignments,
      ).length > 0
    ) {
      continue;
    }

    const withFirstSwap = [
      ...baseAssignments,
      toExistingAssignment(targetSlot, input.employee.id, false),
    ];

    if (
      getConstraintRejections(
        otherEmployee,
        oldSlot.taskType,
        oldSlot,
        withFirstSwap,
      ).length > 0
    ) {
      continue;
    }

    await getDb().$transaction(async (tx) => {
      await tx.assignment.updateMany({
        where: { id: { in: [overlappingAssignment.assignmentId, targetAssignment.id] } },
        data: { status: "REMOVED", removedAt: new Date() },
      });
      await tx.assignment.createMany({
        data: [
          {
            taskSlotId: targetSlot.id,
            employeeId: input.employee.id,
            source: "GENERATED",
            notes: input.notes,
          },
          {
            taskSlotId: oldSlot.id,
            employeeId: otherEmployee.id,
            source: "GENERATED",
            notes: input.notes,
          },
        ],
      });
      await tx.taskSlot.updateMany({
        where: { id: { in: [targetSlot.id, oldSlot.id] } },
        data: { status: "FILLED", notes: null },
      });
    });

    removeAssignmentFromMemory(input.allAssignments, input.employee.id, oldSlot.id);
    removeAssignmentFromMemory(input.allAssignments, otherEmployee.id, targetSlot.id);
    oldSlot.assignments = oldSlot.assignments.filter(
      (assignment) => assignment.id !== overlappingAssignment.assignmentId,
    );
    targetSlot.assignments = targetSlot.assignments.filter(
      (assignment) => assignment.id !== targetAssignment.id,
    );
    oldSlot.assignments.push({
      id: `generated:${oldSlot.id}:${otherEmployee.id}`,
      employeeId: otherEmployee.id,
      source: "GENERATED",
      locked: false,
    });
    targetSlot.assignments.push({
      id: `generated:${targetSlot.id}:${input.employee.id}`,
      employeeId: input.employee.id,
      source: "GENERATED",
      locked: false,
    });
    input.allAssignments.push(toExistingAssignment(targetSlot, input.employee.id, false));
    input.allAssignments.push(toExistingAssignment(oldSlot, otherEmployee.id, false));

    return true;
  }

  return false;
}

function canDirectAssign(
  employee: RepairEmployee,
  slot: RepairSlot,
  allAssignments: ExistingAssignment[],
) {
  if (slot.assignments.length >= (slot.requiredStaff ?? 1)) {
    return false;
  }

  if (wouldExceedExpectedHours(employee, slot, allAssignments)) {
    return false;
  }

  return getConstraintRejections(employee, slot.taskType, slot, allAssignments).length === 0;
}

function explainRepairBlockers(input: {
  employee: RepairEmployee;
  label: string;
  candidates: RepairSlot[];
  matchingShiftBlocks: RepairShiftBlock[];
  backgroundTask: RepairTaskType;
  allAssignments: ExistingAssignment[];
}) {
  const reasons = new Set<string>();

  if (input.candidates.length === 0 && input.matchingShiftBlocks.length === 0) {
    reasons.add("no matching shift block exists");
  }

  for (const slot of input.candidates) {
    if (slot.assignments.length >= (slot.requiredStaff ?? 1)) {
      reasons.add(
        slot.assignments.some((assignment) => assignment.locked)
          ? "matching task slot is full with a locked assignment"
          : "matching task slot is already full",
      );
    }

    for (const reason of getConstraintRejections(
      input.employee,
      slot.taskType,
      slot,
      input.allAssignments,
    )) {
      reasons.add(reason);
    }

    if (wouldExceedExpectedHours(input.employee, slot, input.allAssignments)) {
      reasons.add("would exceed expected weekly hours");
    }
  }

  for (const shiftBlock of input.matchingShiftBlocks) {
    const slot = slotForNewBackground(input.backgroundTask, shiftBlock);

    for (const reason of getConstraintRejections(
      input.employee,
      slot.taskType,
      slot,
      input.allAssignments,
    )) {
      reasons.add(reason);
    }

    if (wouldExceedExpectedHours(input.employee, slot, input.allAssignments)) {
      reasons.add("would exceed expected weekly hours");
    }
  }

  const detail = [...reasons].slice(0, 5).join("; ");

  return detail
    ? `Could not assign ${input.label}: ${detail}.`
    : `Could not assign ${input.label}.`;
}

async function assignSlot(input: {
  slot: RepairSlot;
  employee: RepairEmployee;
  allAssignments: ExistingAssignment[];
  actorEmployeeId?: string | null;
  notes: string;
}) {
  const assignment = await getDb().assignment.create({
    data: {
      taskSlotId: input.slot.id,
      employeeId: input.employee.id,
      source: "GENERATED",
      locked: false,
      assignedByEmployeeId: input.actorEmployeeId ?? undefined,
      notes: input.notes,
    },
  });
  input.slot.assignments.push({
    id: assignment.id,
    employeeId: input.employee.id,
    source: assignment.source,
    locked: assignment.locked,
  });
  input.allAssignments.push(toExistingAssignment(input.slot, input.employee.id, false));

  await getDb().taskSlot.update({
    where: { id: input.slot.id },
    data: {
      status:
        input.slot.assignments.length >= (input.slot.requiredStaff ?? 1)
          ? "FILLED"
          : "OPEN",
      notes: null,
    },
  });
}

async function createWorkPatternTopOffSlot(input: {
  shiftBlock: RepairShiftBlock;
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
      label: `Work pattern top-off #${slotIndex}`,
      startMinute: input.shiftBlock.startMinute,
      endMinute: input.shiftBlock.endMinute,
      minStaff: 0,
      requiredStaff: 1,
      requirementLevel: "OPTIONAL",
      source: GENERATED_WORK_PATTERN_TOP_OFF_SOURCE,
      status: "OPEN",
      notes: "Generated on the exact required work-pattern shift.",
    },
  });
}

function slotForNewBackground(
  taskType: RepairTaskType,
  shiftBlock: RepairShiftBlock,
): RepairSlot {
  return slotForCreatedBackground(
    taskType,
    shiftBlock,
    `new:${shiftBlock.id}`,
    1,
  );
}

function slotForCreatedBackground(
  taskType: RepairTaskType,
  shiftBlock: RepairShiftBlock,
  id: string,
  slotIndex: number,
): RepairSlot {
  return {
    id,
    date: shiftBlock.date,
    scheduleDayId: shiftBlock.scheduleDayId,
    shiftBlockId: shiftBlock.id,
    shiftTemplateId: shiftBlock.shiftTemplateId,
    shiftCategory: shiftBlock.shiftCategory,
    shiftName: shiftBlock.name,
    paidHours: shiftBlock.paidHours,
    taskTypeId: taskType.id,
    slotIndex,
    requirementLevel: "OPTIONAL",
    startMinute: shiftBlock.startMinute,
    endMinute: shiftBlock.endMinute,
    minStaff: 0,
    requiredStaff: 1,
    requiredSkillIds: [],
    eligibleEmployeeIds: [],
    canBePulledForClinic: true,
    protectedFromPull: false,
    lockedEmployeeIds: [],
    status: "OPEN",
    source: GENERATED_WORK_PATTERN_TOP_OFF_SOURCE,
    taskType,
    assignments: [],
  };
}

function validateForEmployee(
  employee: RepairEmployee,
  assignments: ExistingAssignment[],
) {
  return validateEmployeeWeekPattern({
    employee,
    assignments: assignments
      .filter((assignment) => assignment.employeeId === employee.id)
      .map((assignment) => ({
        date: assignment.date,
        shiftBlockId: assignment.shiftBlockId ?? assignment.slotId,
        shiftCategory: assignment.shiftCategory,
        startMinute: assignment.startMinute ?? 0,
        endMinute: assignment.endMinute ?? 24 * 60,
        paidHours: assignment.paidHours ?? 0,
      })),
  });
}

function findMovableOverlappingAssignment(input: {
  employeeId: string;
  targetSlot: RepairSlot;
  slots: RepairSlot[];
}) {
  for (const slot of input.slots) {
    if (slot.date !== input.targetSlot.date) {
      continue;
    }

    if (
      !overlaps(
        slot.startMinute ?? 0,
        slot.endMinute ?? 24 * 60,
        input.targetSlot.startMinute ?? 0,
        input.targetSlot.endMinute ?? 24 * 60,
      )
    ) {
      continue;
    }

    const assignment = slot.assignments.find(
      (candidate) =>
        candidate.employeeId === input.employeeId &&
        isMovableAssignment(candidate),
    );

    if (assignment && (slot.paidHours ?? 0) < (input.targetSlot.paidHours ?? 0)) {
      return { assignmentId: assignment.id, slotId: slot.id };
    }
  }

  return null;
}

function canVacateSlotWithoutRequiredShortage(slot: RepairSlot) {
  const remainingAssignments = slot.assignments.length - 1;

  if (slot.taskType.isBackground || slot.requirementLevel !== "REQUIRED") {
    return true;
  }

  return remainingAssignments >= Math.max(slot.minStaff ?? 0, slot.requiredStaff ?? 1);
}

function statusAfterMovingFromSlot(slot: RepairSlot, hasReplacement: boolean) {
  const remainingAssignments = slot.assignments.length - 1 + (hasReplacement ? 1 : 0);

  return remainingAssignments >= (slot.requiredStaff ?? 1) ? "FILLED" : "OPEN";
}

function findReplacementForVacatedSlot(input: {
  oldSlot: RepairSlot;
  movingEmployeeId: string;
  employeeById: Map<string, RepairEmployee>;
  assignmentsWithMovedEmployee: ExistingAssignment[];
}) {
  return [...input.employeeById.values()]
    .filter((employee) => employee.id !== input.movingEmployeeId)
    .filter(
      (employee) =>
        getConstraintRejections(
          employee,
          input.oldSlot.taskType,
          input.oldSlot,
          input.assignmentsWithMovedEmployee,
        ).length === 0,
    )
    .filter(
      (employee) =>
        !wouldExceedExpectedHours(
          employee,
          input.oldSlot,
          input.assignmentsWithMovedEmployee,
        ),
    )
    .sort((left, right) => left.fullName.localeCompare(right.fullName) || left.id.localeCompare(right.id))
    .map((employee) => ({ employee }))[0] ?? null;
}

function isMovableAssignment(assignment: RepairAssignment) {
  return (
    !assignment.locked &&
    (assignment.source === "GENERATED" ||
      assignment.source === "COVERAGE_REPLACEMENT")
  );
}

function wouldExceedExpectedHours(
  employee: RepairEmployee,
  slot: RepairSlot,
  allAssignments: ExistingAssignment[],
) {
  const employeeAssignments = allAssignments.filter(
    (assignment) => assignment.employeeId === employee.id,
  );
  const currentHours = uniqueScheduledHours(toWorkPatternAssignments(employeeAssignments));
  const alreadyHasShift = employeeAssignments.some(
    (assignment) =>
      assignment.date === slot.date && assignment.shiftBlockId === slot.shiftBlockId,
  );
  const addedHours = alreadyHasShift ? 0 : slot.paidHours ?? 0;

  return currentHours + addedHours > employee.expectedHours;
}

function toExistingAssignment(
  slot: RepairSlot,
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

function toWorkPatternAssignments(assignments: ExistingAssignment[]) {
  return assignments.map((assignment) => ({
    date: assignment.date,
    shiftBlockId: assignment.shiftBlockId ?? assignment.slotId,
    shiftCategory: assignment.shiftCategory,
    startMinute: assignment.startMinute ?? 0,
    endMinute: assignment.endMinute ?? 24 * 60,
    paidHours: assignment.paidHours ?? 0,
  })) satisfies WorkPatternAssignmentInput[];
}

function removeAssignmentFromMemory(
  assignments: ExistingAssignment[],
  employeeId: string,
  slotId: string,
) {
  const index = assignments.findIndex(
    (assignment) =>
      assignment.employeeId === employeeId && assignment.slotId === slotId,
  );

  if (index >= 0) {
    assignments.splice(index, 1);
  }
}

function compareRepairSlots(left: RepairSlot, right: RepairSlot) {
  const leftOpen = left.assignments.length < (left.requiredStaff ?? 1) ? 0 : 1;
  const rightOpen = right.assignments.length < (right.requiredStaff ?? 1) ? 0 : 1;

  return (
    leftOpen - rightOpen ||
    left.date.localeCompare(right.date) ||
    (left.startMinute ?? 0) - (right.startMinute ?? 0) ||
    (left.taskType.isBackground ? 0 : 1) - (right.taskType.isBackground ? 0 : 1) ||
    left.id.localeCompare(right.id)
  );
}

function compareShiftBlocks(left: RepairShiftBlock, right: RepairShiftBlock) {
  return (
    left.date.localeCompare(right.date) ||
    left.startMinute - right.startMinute ||
    left.id.localeCompare(right.id)
  );
}

function weekdayName(weekday: number) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    weekday
  ] ?? `weekday ${weekday}`;
}
