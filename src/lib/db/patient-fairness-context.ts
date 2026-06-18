import type { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import { findEastonTargetForEmployee } from "@/lib/easton-import/employee-targets";
import {
  getEffectiveRequiredBackgroundAssignments,
  getEffectiveWeeklyTargetHours,
  getEffectiveWorkPattern,
  type EmployeeScheduleTargetSource,
} from "@/lib/schedule/easton-work-pattern-resolution";
import { withEastonDerivedAvailability } from "@/lib/schedule/easton-derived-availability";
import { buildJulyWeekSkeletons } from "@/lib/schedule/july-week-planner";
import { julyPatientShiftGroupFromTaskCode } from "@/lib/schedule/patient-shifts";
import {
  toPatientExistingAssignment,
  type PatientRepairEmployee,
  type PatientRepairSlot,
} from "@/lib/schedule/patient-fairness-swap";
import type {
  ExistingAssignment,
  SchedulerTaskType,
} from "@/lib/scheduler";
import { LEGACY_SHIFT_TEMPLATE_ID } from "@/lib/shifts/legacy";
import { parseIsoDate, toIsoDate } from "@/lib/utils/date";

export type PatientRepairContext = {
  startDate: string;
  endDate: string;
  movableDateSet: Set<string>;
  employees: PatientRepairEmployee[];
  slots: PatientRepairSlot[];
  assignments: ExistingAssignment[];
  hasGenerationRun: boolean;
};

export async function loadPatientRepairContext(input: {
  startDate: string;
  endDate: string;
  movableDates: string[];
}): Promise<PatientRepairContext> {
  const db = getDb();
  const [rawEmployees, scheduleTargets, scheduleDays, generationRunCount] =
    await Promise.all([
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
      db.employeeScheduleTarget.findMany({
        where: {
          scheduleEligibility: "ACTIVE_SCHEDULED",
          pattern: {
            code: "EASTON_JULY_ACTIVE_TARGETS",
            active: true,
          },
        },
        orderBy: [{ employeeName: "asc" }, { id: "asc" }],
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
      db.scheduleGenerationRun.count({
        where: {
          status: "COMPLETED",
          dateStart: { lte: parseIsoDate(input.endDate) },
          dateEnd: { gte: parseIsoDate(input.startDate) },
        },
      }),
    ]);

  let employees = rawEmployees.map((employee) =>
    toRepairEmployee(
      employee,
      findEastonTargetForEmployee(employee, scheduleTargets),
    ),
  );
  const slots: PatientRepairSlot[] = [];
  const assignments: ExistingAssignment[] = [];
  const shiftBlocks = scheduleDays.flatMap((day) => {
    const date = toIsoDate(day.date);

    return day.shiftBlocks.map((block) => ({
      id: block.id,
      date,
      shiftCategory: block.shiftCategory,
      startMinute: block.startMinute,
      endMinute: block.endMinute,
      paidHours: Number(block.paidHours),
    }));
  });
  const weekSkeletons = buildJulyWeekSkeletons({ employees, shiftBlocks });

  employees = employees.map((employee) => ({
    ...employee,
    julyWeekSkeleton: weekSkeletons.get(employee.id) ?? null,
  }));

  for (const day of scheduleDays) {
    const date = toIsoDate(day.date);

    for (const slot of day.taskSlots) {
      const taskType = toSchedulerTaskType(slot.taskType);
      const repairSlot: PatientRepairSlot = {
        id: slot.id,
        date,
        scheduleDayId: day.id,
        scheduleDayStatus: day.status,
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
          slot.backgroundTaskInstance?.definition.canBePulledForClinic ??
          false,
        protectedFromPull:
          slot.backgroundTaskInstance?.definition.protectedFromPull ?? false,
        source: slot.source,
        taskType,
        assignments: slot.assignments,
      };
      slots.push(repairSlot);

      for (const assignment of slot.assignments) {
        assignments.push(
          toPatientExistingAssignment(
            repairSlot,
            assignment.employeeId,
            assignment.locked,
          ),
        );
      }
    }
  }

  return {
    startDate: input.startDate,
    endDate: input.endDate,
    movableDateSet: new Set(input.movableDates),
    employees,
    slots,
    assignments,
    hasGenerationRun: generationRunCount > 0,
  };
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
): PatientRepairEmployee {
  const workPattern = getEffectiveWorkPattern({
    employeeWorkPattern: employee.workPattern,
    scheduleTarget,
    expectedWeeklyHours: employee.expectedWeeklyHours,
  });
  const expectedHours = getEffectiveWeeklyTargetHours({
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
    weeklyAssignmentLimit: employee.weeklyAssignmentLimit,
    targetWeeklyHours: expectedHours,
    expectedHours,
    requiredBackgroundAssignments:
      getEffectiveRequiredBackgroundAssignments({
        employeeRequiredBackgroundAssignments:
          employee.requiredWeeklyBackgroundShifts,
        scheduleTarget,
      }),
    workPattern,
  });
}

function toSchedulerTaskType(taskType: {
  id: string;
  code: string;
  name: string;
  isClinical: boolean;
  isBackground: boolean;
  isSkilled: boolean;
  isEndoscopy: boolean;
  isFloat: boolean;
  skillRequirements: Array<{ skillId: string }>;
}): SchedulerTaskType {
  return {
    id: taskType.id,
    code: taskType.code,
    name: taskType.name,
    requiredSkillIds: taskType.skillRequirements.map(
      (requirement) => requirement.skillId,
    ),
    isPatientFacing: Boolean(
      julyPatientShiftGroupFromTaskCode(taskType.code),
    ),
    isClinical: taskType.isClinical,
    isBackground: taskType.isBackground,
    isSkilled: taskType.isSkilled,
    isEndoscopy: taskType.isEndoscopy,
    isFloat: taskType.isFloat,
    exposureGroup: julyPatientShiftGroupFromTaskCode(taskType.code),
  };
}
