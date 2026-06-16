import { getDb } from "@/lib/db";
import {
  findEastonTargetForEmployee,
  findEmployeeForEastonTarget,
} from "@/lib/easton-import/employee-targets";
import {
  evaluateWeeklyHardRequirements,
  type WeeklyHardRequirementAssignment,
  type WeeklyHardRequirementTarget,
} from "@/lib/schedule/hard-requirements";
import {
  getEffectiveRequiredBackgroundAssignments,
  getEffectiveWeeklyTargetHours,
  getEffectiveWorkPattern,
} from "@/lib/schedule/easton-work-pattern-resolution";
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
        activeTargetSheetName: true,
        scheduleEligibility: true,
        scheduleEligibilityReason: true,
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
      where: { status: "ACTIVE", scheduleEligible: true },
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      select: {
        id: true,
        fullName: true,
        expectedWeeklyHours: true,
        requiredWeeklyBackgroundShifts: true,
        workPattern: {
          select: {
            code: true,
            kind: true,
            targetWeeklyHours: true,
            extraHourWeekdays: true,
            requiredSaturdayShiftCategory: true,
            saturdayPaidHours: true,
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

  const hardTargets: WeeklyHardRequirementTarget[] = [
    ...employees.map((employee) => {
      const importedTarget = findEastonTargetForEmployee(employee, targets);
      const workPattern = getEffectiveWorkPattern({
        employeeWorkPattern: employee.workPattern,
        scheduleTarget: importedTarget,
        expectedWeeklyHours: employee.expectedWeeklyHours,
      });

      return {
        employeeId: employee.id,
        employeeName: employee.fullName,
        activeTargetSheetName: importedTarget?.activeTargetSheetName ?? null,
        scheduleEligibility:
          importedTarget?.scheduleEligibility ?? "ACTIVE_SCHEDULED",
        scheduleEligibilityReason:
          importedTarget?.scheduleEligibilityReason ?? null,
        workPatternCode:
          workPattern?.code ?? importedTarget?.workPatternCode ?? null,
        workPatternKind: workPattern?.kind ?? null,
        requiredSaturdayShiftCategory:
          workPattern?.requiredSaturdayShiftCategory ?? null,
        saturdayPaidHours: workPattern?.saturdayPaidHours ?? null,
        requiresWorkPattern:
          Boolean(importedTarget && hasMeaningfulImportedTarget(importedTarget)) ||
          Boolean(workPattern),
        requiredBackgroundAssignments: getEffectiveRequiredBackgroundAssignments({
          employeeRequiredBackgroundAssignments:
            employee.requiredWeeklyBackgroundShifts,
          scheduleTarget: importedTarget,
        }),
        extraHourWeekdays: jsonNumberArray(
          workPattern?.extraHourWeekdays ?? importedTarget?.extraHourWeekdays,
        ),
        expectedWeeklyHours: getEffectiveWeeklyTargetHours({
          workPattern,
          scheduleTarget: importedTarget,
          expectedWeeklyHours: employee.expectedWeeklyHours,
        }),
        targetTaskCounts: jsonNumberRecord(importedTarget?.targetTaskCounts),
      };
    }),
    ...targets
      .filter(
        (target) =>
          target.scheduleEligibility === "ACTIVE_SCHEDULED" &&
          !findEmployeeForEastonTarget(target, employees) &&
          hasMeaningfulImportedTarget(target),
      )
      .map((target) => ({
        employeeId: target.employeeId,
        employeeName: target.employeeName,
        activeTargetSheetName: target.activeTargetSheetName,
        scheduleEligibility: target.scheduleEligibility,
        scheduleEligibilityReason: target.scheduleEligibilityReason,
        workPatternCode: target.workPatternCode,
        workPatternKind: null,
        requiredSaturdayShiftCategory: null,
        saturdayPaidHours: null,
        requiresWorkPattern: true,
        requiredBackgroundAssignments: target.requiredBackgroundAssignments,
        extraHourWeekdays: jsonNumberArray(target.extraHourWeekdays),
        expectedWeeklyHours: Number(target.targetTotalHours ?? 40),
        targetTaskCounts: jsonNumberRecord(target.targetTaskCounts),
      })),
  ];
  const assignments: WeeklyHardRequirementAssignment[] = scheduleDays.flatMap((day) =>
    day.taskSlots.flatMap((slot) =>
      slot.assignments.map((assignment) => ({
        employeeId: assignment.employeeId,
        date: toIsoDate(day.date),
        shiftBlockId: slot.shiftBlockId,
        shiftCategory: slot.shiftBlock.shiftCategory,
        startMinute: slot.shiftBlock.startMinute,
        endMinute: slot.shiftBlock.endMinute,
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

function hasPositiveTargetCounts(value: unknown) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return false;
  }

  return Object.values(value).some((item) => Number(item) > 0);
}

function hasMeaningfulImportedTarget(target: {
  scheduleEligibility?: string | null;
  workPatternCode?: string | null;
  requiredBackgroundAssignments: number;
  targetPatientShifts: unknown;
  targetTaskCounts: unknown;
  targetTotalHours: unknown;
  exposureGoals: unknown;
}) {
  if (
    target.scheduleEligibility &&
    target.scheduleEligibility !== "ACTIVE_SCHEDULED"
  ) {
    return false;
  }

  return (
    Boolean(target.workPatternCode) ||
    target.requiredBackgroundAssignments > 0 ||
    Number(target.targetPatientShifts ?? 0) > 0 ||
    Number(target.targetTotalHours ?? 0) > 0 ||
    (Array.isArray(target.exposureGoals) && target.exposureGoals.length > 0) ||
    hasPositiveTargetCounts(target.targetTaskCounts)
  );
}
