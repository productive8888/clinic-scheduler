import { getDb } from "@/lib/db";
import { findEastonTargetForEmployee } from "@/lib/easton-import/employee-targets";
import type {
  ExistingAssignment,
  SchedulerEmployee,
  SchedulerTaskSlot,
  SchedulerTaskType,
} from "@/lib/scheduler/types";
import {
  validateManualAssignment,
  type ManualAssignmentWarning,
} from "@/lib/schedule/manual-validation";
import { clinicWeekRange } from "@/lib/schedule/range";
import { patternPreferredEmployeeIdsForSlot } from "@/lib/schedule/pattern-preferences";
import {
  getEffectiveWeeklyTargetHours,
  getEffectiveWorkPattern,
  type EmployeeScheduleTargetSource,
} from "@/lib/schedule/easton-work-pattern-resolution";
import { withEastonDerivedAvailability } from "@/lib/schedule/easton-derived-availability";
import { ACTIVE_EASTON_TARGET_PATTERN_CODE } from "@/lib/schedule/easton-model";
import { LEGACY_SHIFT_TEMPLATE_ID } from "@/lib/shifts/legacy";
import { parseIsoDate, toIsoDate } from "@/lib/utils/date";

export type ManualAssignmentWarningMatrix = Record<
  string,
  Record<string, ManualAssignmentWarning[]>
>;

export async function getManualAssignmentWarnings(input: {
  slotId: string;
  employeeId: string | null;
}) {
  const slot = await getDb().taskSlot.findUniqueOrThrow({
    where: { id: input.slotId },
    include: {
      scheduleDay: true,
      shiftBlock: true,
      taskType: {
        include: { skillRequirements: true },
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
    },
  });
  const date = toIsoDate(slot.scheduleDay.date);
  const week = clinicWeekRange(date);
  const [patternSlots, scheduleTargets] = await Promise.all([
    getActivePatternSlotsForDate(slot.scheduleDay.date),
    getDb().employeeScheduleTarget.findMany({
      where: {
        scheduleEligibility: "ACTIVE_SCHEDULED",
        pattern: {
          code: ACTIVE_EASTON_TARGET_PATTERN_CODE,
          active: true,
        },
      },
      orderBy: [{ employeeName: "asc" }, { id: "asc" }],
    }),
  ]);
  const employee = input.employeeId
    ? await getDb().employee.findUniqueOrThrow({
        where: { id: input.employeeId },
        include: {
          skills: true,
          workPattern: true,
          availability: { where: { active: true } },
          ptoRequests: {
            where: {
              status: { in: ["APPROVED", "OVERRIDDEN"] },
              startDate: { lte: slot.scheduleDay.date },
              endDate: { gte: slot.scheduleDay.date },
            },
          },
          nptoRequests: {
            where: {
              status: { in: ["APPROVED", "OVERRIDDEN"] },
              startDate: { lte: slot.scheduleDay.date },
              endDate: { gte: slot.scheduleDay.date },
            },
          },
        },
      })
    : null;
  const assignments = input.employeeId
    ? await getDb().assignment.findMany({
        where: {
          status: "ACTIVE",
          taskSlotId: { not: slot.id },
          taskSlot: {
            scheduleDay: {
              date: {
                gte: parseIsoDate(week.startDate),
                lte: parseIsoDate(week.endDate),
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
      })
    : [];

  const scheduleTarget = employee
    ? findEastonTargetForEmployee(employee, scheduleTargets)
    : null;
  const workPattern = employee
    ? getEffectiveWorkPattern({
        employeeWorkPattern: employee.workPattern,
        scheduleTarget,
        expectedWeeklyHours: employee.expectedWeeklyHours,
      })
    : null;

  return validateManualAssignment({
    employee: employee
      ? toSchedulerEmployee(employee, scheduleTarget)
      : null,
    taskType: toSchedulerTaskType(slot.taskType),
    slot: toSchedulerSlot(
      slot,
      patternPreferredEmployeeIdsForSlot({ slot, patternSlots }),
    ),
    assignments: assignments.map(toExistingAssignment),
    expectedWeeklyHours: employee
      ? getEffectiveWeeklyTargetHours({
          workPattern,
          scheduleTarget,
          expectedWeeklyHours: employee.expectedWeeklyHours,
        })
      : null,
    clearingRequiredSlot: !employee && slot.requirementLevel === "REQUIRED",
  });
}

export async function getManualAssignmentWarningMatrix(date: string) {
  const dateValue = parseIsoDate(date);
  const week = clinicWeekRange(date);
  const [slots, employees, assignments, patternSlots, scheduleTargets] = await Promise.all([
    getDb().taskSlot.findMany({
      where: {
        scheduleDay: { date: dateValue },
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
        scheduleDay: true,
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
      },
    }),
    getDb().employee.findMany({
      where: { status: "ACTIVE" },
      include: {
        skills: true,
        workPattern: true,
        availability: { where: { active: true } },
        ptoRequests: {
          where: {
            status: { in: ["APPROVED", "OVERRIDDEN"] },
            startDate: { lte: dateValue },
            endDate: { gte: dateValue },
          },
        },
        nptoRequests: {
          where: {
            status: { in: ["APPROVED", "OVERRIDDEN"] },
            startDate: { lte: dateValue },
            endDate: { gte: dateValue },
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
              gte: parseIsoDate(week.startDate),
              lte: parseIsoDate(week.endDate),
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
    }),
    getActivePatternSlotsForDate(dateValue),
    getDb().employeeScheduleTarget.findMany({
      where: {
        scheduleEligibility: "ACTIVE_SCHEDULED",
        pattern: {
          code: ACTIVE_EASTON_TARGET_PATTERN_CODE,
          active: true,
        },
      },
      orderBy: [{ employeeName: "asc" }, { id: "asc" }],
    }),
  ]);
  const matrix: ManualAssignmentWarningMatrix = {};

  for (const slot of slots) {
    const schedulerSlot = toSchedulerSlot(
      slot,
      patternPreferredEmployeeIdsForSlot({ slot, patternSlots }),
    );
    const schedulerTaskType = toSchedulerTaskType(slot.taskType);
    matrix[slot.id] = {
      __CLEAR__: validateManualAssignment({
        employee: null,
        taskType: schedulerTaskType,
        slot: schedulerSlot,
        assignments: [],
        clearingRequiredSlot: slot.requirementLevel === "REQUIRED",
      }),
    };

    for (const employee of employees) {
      const scheduleTarget = findEastonTargetForEmployee(employee, scheduleTargets);
      const workPattern = getEffectiveWorkPattern({
        employeeWorkPattern: employee.workPattern,
        scheduleTarget,
        expectedWeeklyHours: employee.expectedWeeklyHours,
      });

      matrix[slot.id][employee.id] = validateManualAssignment({
        employee: toSchedulerEmployee(employee, scheduleTarget),
        taskType: schedulerTaskType,
        slot: schedulerSlot,
        assignments: assignments
          .filter((assignment) => assignment.taskSlotId !== slot.id)
          .map(toExistingAssignment),
        expectedWeeklyHours: getEffectiveWeeklyTargetHours({
          workPattern,
          scheduleTarget,
          expectedWeeklyHours: employee.expectedWeeklyHours,
        }),
      });
    }
  }

  return matrix;
}

function toSchedulerEmployee(
  employee: {
  id: string;
  fullName: string;
  status: string;
  weeklyAssignmentLimit: number | null;
  expectedWeeklyHours: unknown;
  workPattern: {
    kind: "CUSTOM" | "ENDOSCOPY_SATURDAY" | "NON_ENDOSCOPY_SATURDAY";
    worksTuesdayThroughSaturday: boolean;
    saturdayPaidHours: unknown;
    requiredSaturdayShiftCategory:
      | "AM"
      | "PM"
      | "SATURDAY"
      | "ENDO"
      | "FLOAT"
      | "OTHER"
      | null;
    extraHourWeekdays: unknown;
    mondayOffAllowed: boolean;
    fridayOffAllowed: boolean;
    earlyStartDaysPerWeek: number;
  } | null;
  skills: { skillId: string }[];
  availability: Array<{
    weekday: number;
    startMinute: number;
    endMinute: number;
    effectiveStartDate: Date;
    effectiveEndDate: Date | null;
    active: boolean;
  }>;
  ptoRequests: Array<{
    startDate: Date;
    endDate: Date;
    startMinute: number | null;
    endMinute: number | null;
  }>;
  nptoRequests: Array<{
    startDate: Date;
    endDate: Date;
    startMinute: number | null;
    endMinute: number | null;
  }>;
  },
  scheduleTarget?: EmployeeScheduleTargetSource,
): SchedulerEmployee {
  const workPattern = getEffectiveWorkPattern({
    employeeWorkPattern: employee.workPattern,
    scheduleTarget,
    expectedWeeklyHours: employee.expectedWeeklyHours,
  });

  return withEastonDerivedAvailability({
    id: employee.id,
    fullName: employee.fullName,
    active: employee.status === "ACTIVE",
    weeklyAssignmentLimit: employee.weeklyAssignmentLimit,
    skillIds: employee.skills.map((skill) => skill.skillId),
    availability: employee.availability.map((window) => ({
      weekday: window.weekday,
      startMinute: window.startMinute,
      endMinute: window.endMinute,
      effectiveStartDate: toIsoDate(window.effectiveStartDate),
      effectiveEndDate: window.effectiveEndDate
        ? toIsoDate(window.effectiveEndDate)
        : null,
      active: window.active,
    })),
    unavailable: [...employee.ptoRequests, ...employee.nptoRequests].map(
      (request) => ({
        startDate: toIsoDate(request.startDate),
        endDate: toIsoDate(request.endDate),
        startMinute: request.startMinute,
        endMinute: request.endMinute,
        active: true,
      }),
    ),
    workPattern,
  });
}

function toSchedulerTaskType(taskType: {
  id: string;
  code: string;
  name: string;
  skillRequirements: { skillId: string }[];
  difficultyWeight: number;
  sortOrder: number;
  isPatientFacing: boolean;
  isClinical: boolean;
  isBackground: boolean;
  isSkilled: boolean;
  isEndoscopy: boolean;
  isFloat: boolean;
}): SchedulerTaskType {
  return {
    id: taskType.id,
    code: taskType.code,
    name: taskType.name,
    requiredSkillIds: taskType.skillRequirements.map((requirement) => requirement.skillId),
    difficultyWeight: taskType.difficultyWeight,
    sortOrder: taskType.sortOrder,
    isPatientFacing: taskType.isPatientFacing,
    isClinical: taskType.isClinical,
    isBackground: taskType.isBackground,
    isSkilled: taskType.isSkilled,
    isEndoscopy: taskType.isEndoscopy,
    isFloat: taskType.isFloat,
  };
}

function toSchedulerSlot(
  slot: {
  id: string;
  taskTypeId: string;
  slotIndex: number;
  startMinute: number | null;
  endMinute: number | null;
  requirementLevel: "REQUIRED" | "DESIRED" | "OPTIONAL" | "CONDITIONAL";
  shiftBlockId: string;
  scheduleDay: { date: Date };
  shiftBlock: {
    shiftTemplateId: string | null;
    shiftCategory: "AM" | "PM" | "SATURDAY" | "ENDO" | "FLOAT" | "OTHER";
    name: string;
    startMinute: number;
    endMinute: number;
    paidHours: unknown;
  };
  backgroundTaskInstance: {
    definition: {
      requiredSkills: { skillId: string }[];
      eligibleEmployees: { employeeId: string }[];
    };
  } | null;
  },
  patternPreferredEmployeeIds: string[] = [],
): SchedulerTaskSlot {
  return {
    id: slot.id,
    date: toIsoDate(slot.scheduleDay.date),
    taskTypeId: slot.taskTypeId,
    slotIndex: slot.slotIndex,
    shiftBlockId: slot.shiftBlockId,
    shiftTemplateId: slot.shiftBlock.shiftTemplateId,
    shiftCategory: slot.shiftBlock.shiftCategory,
    shiftName: slot.shiftBlock.name,
    paidHours: Number(slot.shiftBlock.paidHours),
    startMinute: slot.startMinute ?? slot.shiftBlock.startMinute,
    endMinute: slot.endMinute ?? slot.shiftBlock.endMinute,
    requirementLevel: slot.requirementLevel,
    patternPreferredEmployeeIds,
    requiredSkillIds:
      slot.backgroundTaskInstance?.definition.requiredSkills.map(
        (requirement) => requirement.skillId,
      ) ?? [],
    eligibleEmployeeIds:
      slot.backgroundTaskInstance?.definition.eligibleEmployees.map(
        (eligible) => eligible.employeeId,
      ) ?? [],
  };
}

function getActivePatternSlotsForDate(date: Date) {
  return getDb().schedulePatternSlot.findMany({
    where: {
      weekday: date.getUTCDay(),
      pattern: {
        active: true,
        AND: [
          {
            OR: [
              { effectiveStartDate: null },
              { effectiveStartDate: { lte: date } },
            ],
          },
          {
            OR: [
              { effectiveEndDate: null },
              { effectiveEndDate: { gte: date } },
            ],
          },
        ],
      },
    },
    select: {
      taskTypeId: true,
      slotIndex: true,
      shiftTemplateId: true,
      shiftCategory: true,
      preferredEmployeeId: true,
    },
    orderBy: [{ slotIndex: "asc" }, { id: "asc" }],
  });
}

function toExistingAssignment(assignment: {
  employeeId: string;
  locked: boolean;
  taskSlot: {
    id: string;
    taskTypeId: string;
    scheduleDay: { date: Date };
    shiftBlock: {
      id: string;
      shiftCategory: "AM" | "PM" | "SATURDAY" | "ENDO" | "FLOAT" | "OTHER";
      startMinute: number;
      endMinute: number;
      paidHours: unknown;
    };
    taskType: {
      isPatientFacing: boolean;
      isClinical: boolean;
      isBackground: boolean;
      isEndoscopy: boolean;
    };
  };
}): ExistingAssignment {
  return {
    slotId: assignment.taskSlot.id,
    employeeId: assignment.employeeId,
    date: toIsoDate(assignment.taskSlot.scheduleDay.date),
    taskTypeId: assignment.taskSlot.taskTypeId,
    startMinute: assignment.taskSlot.shiftBlock.startMinute,
    endMinute: assignment.taskSlot.shiftBlock.endMinute,
    shiftBlockId: assignment.taskSlot.shiftBlock.id,
    shiftCategory: assignment.taskSlot.shiftBlock.shiftCategory,
    paidHours: Number(assignment.taskSlot.shiftBlock.paidHours),
    isPatientFacing: assignment.taskSlot.taskType.isPatientFacing,
    isClinical: assignment.taskSlot.taskType.isClinical,
    isBackground: assignment.taskSlot.taskType.isBackground,
    isEndoscopy: assignment.taskSlot.taskType.isEndoscopy,
    locked: assignment.locked,
  };
}
