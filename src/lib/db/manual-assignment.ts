import { getDb } from "@/lib/db";
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
  const employee = input.employeeId
    ? await getDb().employee.findUniqueOrThrow({
        where: { id: input.employeeId },
        include: {
          skills: true,
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

  return validateManualAssignment({
    employee: employee ? toSchedulerEmployee(employee) : null,
    taskType: toSchedulerTaskType(slot.taskType),
    slot: toSchedulerSlot(slot),
    assignments: assignments.map(toExistingAssignment),
    expectedWeeklyHours: employee ? Number(employee.expectedWeeklyHours) : null,
    clearingRequiredSlot: !employee && slot.requirementLevel === "REQUIRED",
  });
}

export async function getManualAssignmentWarningMatrix(date: string) {
  const dateValue = parseIsoDate(date);
  const week = clinicWeekRange(date);
  const [slots, employees, assignments] = await Promise.all([
    getDb().taskSlot.findMany({
      where: {
        scheduleDay: { date: dateValue },
        status: { not: "CANCELLED" },
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
  ]);
  const matrix: ManualAssignmentWarningMatrix = {};

  for (const slot of slots) {
    const schedulerSlot = toSchedulerSlot(slot);
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
      matrix[slot.id][employee.id] = validateManualAssignment({
        employee: toSchedulerEmployee(employee),
        taskType: schedulerTaskType,
        slot: schedulerSlot,
        assignments: assignments
          .filter((assignment) => assignment.taskSlotId !== slot.id)
          .map(toExistingAssignment),
        expectedWeeklyHours: Number(employee.expectedWeeklyHours),
      });
    }
  }

  return matrix;
}

function toSchedulerEmployee(employee: {
  id: string;
  fullName: string;
  status: string;
  weeklyAssignmentLimit: number | null;
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
}): SchedulerEmployee {
  return {
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
  };
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

function toSchedulerSlot(slot: {
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
}): SchedulerTaskSlot {
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
