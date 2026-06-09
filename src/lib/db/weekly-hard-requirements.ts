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
  const [targets, scheduleDays] = await Promise.all([
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
        targetPatientShifts: true,
        targetTaskCounts: true,
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

  const hardTargets: WeeklyHardRequirementTarget[] = targets.map((target) => ({
    employeeId: target.employeeId,
    employeeName: target.employeeName,
    workPatternCode: target.workPatternCode,
    requiresWorkPattern:
      Boolean(target.targetPatientShifts && Number(target.targetPatientShifts) > 0) ||
      hasPositiveTargetCounts(target.targetTaskCounts),
    requiredBackgroundAssignments: target.requiredBackgroundAssignments,
    extraHourWeekdays: jsonNumberArray(target.extraHourWeekdays),
  }));
  const assignments: WeeklyHardRequirementAssignment[] = scheduleDays.flatMap((day) =>
    day.taskSlots.flatMap((slot) =>
      slot.assignments.map((assignment) => ({
        employeeId: assignment.employeeId,
        date: toIsoDate(day.date),
        shiftBlockId: slot.shiftBlockId,
        shiftCategory: slot.shiftBlock.shiftCategory,
        paidHours: Number(slot.shiftBlock.paidHours),
        taskTypeCode: slot.taskType.code,
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
