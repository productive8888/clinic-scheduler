import {
  AssignmentStatus,
  type Prisma,
  TaskSlotStatus,
} from "@prisma/client";
import { parseIsoDate, todayIsoDate, toIsoDate } from "@/lib/utils/date";

export type EmployeeScheduleInvalidationResult = {
  affectedScheduleDayIds: string[];
  affectedDates: string[];
  affectedSlotCount: number;
};

export async function invalidateFutureEmployeeAssignments(
  tx: Prisma.TransactionClient,
  input: {
    employeeId: string;
    employeeName: string;
    reason: "deactivated" | "deleted";
    invalidatedAt?: Date;
    fromDate?: string;
  },
) {
  const invalidatedAt = input.invalidatedAt ?? new Date();
  const fromDate = parseIsoDate(input.fromDate ?? todayIsoDate());
  const activeAssignedSlots = await tx.taskSlot.findMany({
    where: {
      scheduleDay: { date: { gte: fromDate } },
      assignments: {
        some: {
          employeeId: input.employeeId,
          status: AssignmentStatus.ACTIVE,
        },
      },
      status: { not: TaskSlotStatus.CANCELLED },
    },
    select: {
      id: true,
      requiredStaff: true,
      requirementLevel: true,
      scheduleDay: {
        select: {
          id: true,
          date: true,
          notes: true,
        },
      },
      assignments: {
        where: {
          status: AssignmentStatus.ACTIVE,
          employeeId: { not: input.employeeId },
        },
        select: { id: true },
      },
    },
  });
  const affectedScheduleDays = new Map(
    activeAssignedSlots.map((slot) => [slot.scheduleDay.id, slot.scheduleDay]),
  );

  await tx.assignment.updateMany({
    where: {
      employeeId: input.employeeId,
      status: AssignmentStatus.ACTIVE,
      taskSlot: { scheduleDay: { date: { gte: fromDate } } },
    },
    data: {
      status: AssignmentStatus.REMOVED,
      removedAt: invalidatedAt,
      notes: `Removed because the employee was ${input.reason}.`,
    },
  });

  for (const slot of activeAssignedSlots) {
    const remainingAssignments = slot.assignments.length;
    const status = invalidatedTaskSlotStatus({
      remainingAssignments,
      requiredStaff: slot.requiredStaff,
      requirementLevel: slot.requirementLevel,
    });

    await tx.taskSlot.update({
      where: { id: slot.id },
      data: {
        status,
        notes:
          status === TaskSlotStatus.SHORTAGE
            ? `${input.employeeName} was ${input.reason}; regenerate or manually assign coverage.`
            : null,
      },
    });
  }

  for (const scheduleDay of affectedScheduleDays.values()) {
    await tx.scheduleDay.update({
      where: { id: scheduleDay.id },
      data: invalidatedScheduleDayData({
        existingNotes: scheduleDay.notes,
        employeeName: input.employeeName,
        reason: input.reason,
        invalidatedAt,
      }),
    });
  }

  return {
    affectedScheduleDayIds: [...affectedScheduleDays.keys()],
    affectedDates: [...affectedScheduleDays.values()]
      .map((day) => toIsoDate(day.date))
      .sort(),
    affectedSlotCount: activeAssignedSlots.length,
  } satisfies EmployeeScheduleInvalidationResult;
}

export function invalidatedTaskSlotStatus(input: {
  remainingAssignments: number;
  requiredStaff: number;
  requirementLevel: string;
}) {
  if (input.remainingAssignments >= input.requiredStaff) {
    return TaskSlotStatus.FILLED;
  }

  if (input.requiredStaff > 0 && input.requirementLevel === "REQUIRED") {
    return TaskSlotStatus.SHORTAGE;
  }

  return TaskSlotStatus.OPEN;
}

export function invalidatedScheduleDayData(input: {
  existingNotes?: string | null;
  employeeName: string;
  reason: "deactivated" | "deleted";
  invalidatedAt: Date;
}) {
  return {
    status: "NEEDS_REGENERATION" as const,
    publishedAt: null,
    publishedByEmployeeId: null,
    notes: appendNote(
      input.existingNotes,
      `Needs regeneration: ${input.employeeName} was ${input.reason} on ${input.invalidatedAt.toISOString()}.`,
    ),
  };
}

function appendNote(existing: string | null | undefined, next: string) {
  return [existing?.trim(), next].filter(Boolean).join("\n");
}
