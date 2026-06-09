import { getDb } from "@/lib/db";
import {
  evaluateWeeklyHardRequirements,
  type WeeklyHardRequirementAssignment,
  type WeeklyHardRequirementTarget,
} from "@/lib/schedule/hard-requirements";
import { parseIsoDate, toIsoDate } from "@/lib/utils/date";

export async function getWeeklyHardRequirementSummary(input: {
  startDate: string;
  endDate: string;
}) {
  const [targets, employees, scheduleDays] = await Promise.all([
    getDb().employeeScheduleTarget.findMany({
      where: {
        pattern: {
          code: "EASTON_JULY_ACTIVE_TARGETS",
          active: true,
        },
      },
      orderBy: [{ employeeName: "asc" }, { id: "asc" }],
      select: {
        employeeId: true,
        employeeName: true,
        workPatternCode: true,
        requiredBackgroundAssignments: true,
        extraHourWeekdays: true,
        targetTotalHours: true,
        targetPatientShifts: true,
        targetTaskCounts: true,
        exposureGoals: true,
      },
    }),
    getDb().employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      select: {
        id: true,
        fullName: true,
        expectedWeeklyHours: true,
        requiredWeeklyBackgroundShifts: true,
        workPattern: {
          select: {
            code: true,
            targetWeeklyHours: true,
            extraHourWeekdays: true,
          },
        },
      },
    }),
    getDb().scheduleDay.findMany({
      where: {
        date: {
          gte: parseIsoDate(input.startDate),
          lte: parseIsoDate(input.endDate),
        },
      },
      include: {
        taskSlots: {
          where: { status: { not: "CANCELLED" } },
          include: {
            shiftBlock: true,
            taskType: true,
            assignments: {
              where: { status: "ACTIVE" },
              select: { employeeId: true },
            },
          },
        },
      },
    }),
  ]);

  const targetByEmployeeId = new Map(
    targets
      .filter((target) => target.employeeId)
      .map((target) => [target.employeeId!, target]),
  );
  const activeEmployeeIds = new Set(employees.map((employee) => employee.id));
  const hardTargets: WeeklyHardRequirementTarget[] = [
    ...employees.map((employee) => {
      const importedTarget = targetByEmployeeId.get(employee.id);

      return {
        employeeId: employee.id,
        employeeName: employee.fullName,
        workPatternCode:
          employee.workPattern?.code ?? importedTarget?.workPatternCode ?? null,
        requiresWorkPattern:
          Boolean(importedTarget && hasMeaningfulImportedTarget(importedTarget)) ||
          Boolean(employee.workPattern),
        requiredBackgroundAssignments:
          employee.requiredWeeklyBackgroundShifts,
        extraHourWeekdays: jsonNumberArray(
          employee.workPattern?.extraHourWeekdays ??
            importedTarget?.extraHourWeekdays,
        ),
        expectedWeeklyHours: Number(
          employee.workPattern?.targetWeeklyHours ?? employee.expectedWeeklyHours,
        ),
      };
    }),
    ...targets
      .filter(
        (target) =>
          (!target.employeeId || !activeEmployeeIds.has(target.employeeId)) &&
          hasMeaningfulImportedTarget(target),
      )
      .map((target) => ({
        employeeId: target.employeeId,
        employeeName: target.employeeName,
        workPatternCode: target.workPatternCode,
        requiresWorkPattern: true,
        requiredBackgroundAssignments: target.requiredBackgroundAssignments,
        extraHourWeekdays: jsonNumberArray(target.extraHourWeekdays),
        expectedWeeklyHours: Number(target.targetTotalHours ?? 40),
      })),
  ];
  const assignments: WeeklyHardRequirementAssignment[] = scheduleDays.flatMap((day) =>
    day.taskSlots.flatMap((slot) =>
      slot.assignments.map((assignment) => ({
        employeeId: assignment.employeeId,
        date: toIsoDate(day.date),
        shiftBlockId: slot.shiftBlockId,
        shiftCategory: slot.shiftBlock.shiftCategory,
        paidHours: Number(slot.shiftBlock.paidHours),
        taskTypeCode: slot.taskType.code,
        isBackground: slot.taskType.isBackground,
      })),
    ),
  );

  return {
    ...evaluateWeeklyHardRequirements({
      targets: hardTargets,
      assignments,
    }),
    targets: hardTargets,
  };
}

function jsonNumberArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(Number).filter((item) => Number.isFinite(item));
}

function hasPositiveTargetCounts(value: unknown) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return false;
  }

  return Object.values(value).some((item) => Number(item) > 0);
}

function hasMeaningfulImportedTarget(target: {
  requiredBackgroundAssignments: number;
  targetPatientShifts: unknown;
  targetTaskCounts: unknown;
  targetTotalHours: unknown;
  exposureGoals: unknown;
}) {
  return (
    target.requiredBackgroundAssignments > 0 ||
    Number(target.targetPatientShifts ?? 0) > 0 ||
    Number(target.targetTotalHours ?? 0) > 0 ||
    (Array.isArray(target.exposureGoals) && target.exposureGoals.length > 0) ||
    hasPositiveTargetCounts(target.targetTaskCounts)
  );
}
