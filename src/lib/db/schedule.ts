import { createHash } from "node:crypto";
import { AssignmentSource, AssignmentStatus, TaskSlotStatus } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import {
  generateSchedule,
  SCHEDULER_ENGINE_VERSION,
  type ExistingAssignment,
  type SchedulerEmployee,
  type SchedulerTaskSlot,
  type SchedulerTaskType,
} from "@/lib/scheduler";
import { parseIsoDate, toIsoDate } from "@/lib/utils/date";

export async function getScheduleBoard(date: string) {
  return getDb().scheduleDay.findUnique({
    where: { date: parseIsoDate(date) },
    include: {
      taskSlots: {
        orderBy: [
          { taskType: { sortOrder: "asc" } },
          { slotIndex: "asc" },
        ],
        include: {
          taskType: {
            include: {
              skillRequirements: {
                include: { skill: true },
              },
            },
          },
          assignments: {
            where: { status: "ACTIVE" },
            include: { employee: true },
            orderBy: { assignedAt: "desc" },
          },
        },
      },
    },
  });
}

export async function getSchedulePageData(date: string) {
  const [scheduleDay, employees, taskTypes] = await Promise.all([
    getScheduleBoard(date),
    getDb().employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      include: { skills: { include: { skill: true } } },
    }),
    getDb().taskType.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { skillRequirements: { include: { skill: true } } },
    }),
  ]);

  return { scheduleDay, employees, taskTypes };
}

export async function ensureScheduleDayWithDefaultSlots(
  date: string,
  actorEmployeeId?: string | null,
) {
  const db = getDb();
  const dateValue = parseIsoDate(date);

  const scheduleDay = await db.scheduleDay.upsert({
    where: { date: dateValue },
    update: {},
    create: {
      date: dateValue,
      status: "DRAFT",
    },
  });

  const taskTypes = await db.taskType.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });

  for (const taskType of taskTypes) {
    await db.taskSlot.upsert({
      where: {
        scheduleDayId_taskTypeId_slotIndex: {
          scheduleDayId: scheduleDay.id,
          taskTypeId: taskType.id,
          slotIndex: 1,
        },
      },
      update: {},
      create: {
        scheduleDayId: scheduleDay.id,
        taskTypeId: taskType.id,
        slotIndex: 1,
        label: taskType.name,
        status: "OPEN",
        minStaff: 1,
        requiredStaff: 1,
      },
    });
  }

  await writeAuditLog({
    actorEmployeeId,
    action: "schedule_day.ensure_default_slots",
    entityType: "ScheduleDay",
    entityId: scheduleDay.id,
    after: { date, taskSlotCount: taskTypes.length },
  });

  return scheduleDay;
}

export async function manuallyAssignSlot(input: {
  slotId: string;
  employeeId: string | null;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();

  const result = await db.$transaction(async (tx) => {
    const slot = await tx.taskSlot.findUniqueOrThrow({
      where: { id: input.slotId },
      include: {
        assignments: {
          where: { status: "ACTIVE" },
          include: { employee: true },
        },
      },
    });

    await tx.assignment.updateMany({
      where: {
        taskSlotId: input.slotId,
        status: "ACTIVE",
      },
      data: {
        status: "REMOVED",
        removedAt: new Date(),
      },
    });

    const assignment = input.employeeId
      ? await tx.assignment.create({
          data: {
            taskSlotId: input.slotId,
            employeeId: input.employeeId,
            source: "MANUAL_OVERRIDE",
            locked: true,
            assignedByEmployeeId: input.actorEmployeeId ?? undefined,
          },
        })
      : null;

    await tx.taskSlot.update({
      where: { id: input.slotId },
      data: {
        status: input.employeeId ? "FILLED" : "OPEN",
      },
    });

    return {
      slot,
      assignment,
      before: slot.assignments.map((existing) => ({
        assignmentId: existing.id,
        employeeId: existing.employeeId,
      })),
    };
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: input.employeeId ? "assignment.manual_override" : "assignment.clear",
    entityType: "TaskSlot",
    entityId: input.slotId,
    before: result.before,
    after: result.assignment
      ? {
          assignmentId: result.assignment.id,
          employeeId: result.assignment.employeeId,
        }
      : null,
  });
}

export async function generateScheduleForDate(input: {
  date: string;
  seed: string;
  actorEmployeeId?: string | null;
}) {
  await ensureScheduleDayWithDefaultSlots(input.date, input.actorEmployeeId);

  const [scheduleDay, employees, historicalAssignments] = await Promise.all([
    getScheduleBoard(input.date),
    getDb().employee.findMany({
      where: { status: "ACTIVE" },
      include: {
        skills: true,
        availability: { where: { active: true } },
        ptoRequests: {
          where: {
            status: "APPROVED",
            startDate: { lte: parseIsoDate(input.date) },
            endDate: { gte: parseIsoDate(input.date) },
          },
        },
      },
      orderBy: { fullName: "asc" },
    }),
    getDb().assignment.findMany({
      where: { status: "ACTIVE" },
      include: { taskSlot: true },
    }),
  ]);

  if (!scheduleDay) {
    throw new Error("Schedule day was not created");
  }

  const taskTypes = new Map(
    scheduleDay.taskSlots.map((slot) => [
      slot.taskType.id,
      {
        id: slot.taskType.id,
        code: slot.taskType.code,
        name: slot.taskType.name,
        requiredSkillIds: slot.taskType.skillRequirements.map(
          (requirement) => requirement.skillId,
        ),
        interchangeableGroup: slot.taskType.interchangeableGroup,
        difficultyWeight: slot.taskType.difficultyWeight,
        sortOrder: slot.taskType.sortOrder,
      } satisfies SchedulerTaskType,
    ]),
  );

  const historicalCountByEmployee = new Map<string, number>();
  const historicalTaskCountByEmployee = new Map<string, Record<string, number>>();

  for (const assignment of historicalAssignments) {
    historicalCountByEmployee.set(
      assignment.employeeId,
      (historicalCountByEmployee.get(assignment.employeeId) ?? 0) + 1,
    );

    const taskCounts =
      historicalTaskCountByEmployee.get(assignment.employeeId) ?? {};
    taskCounts[assignment.taskSlot.taskTypeId] =
      (taskCounts[assignment.taskSlot.taskTypeId] ?? 0) + 1;
    historicalTaskCountByEmployee.set(assignment.employeeId, taskCounts);
  }

  const schedulerEmployees: SchedulerEmployee[] = employees.map((employee) => ({
    id: employee.id,
    fullName: employee.fullName,
    active: employee.status === "ACTIVE",
    skillIds: employee.skills.map((skill) => skill.skillId),
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
    unavailable: employee.ptoRequests.map((request) => ({
      startDate: toIsoDate(request.startDate),
      endDate: toIsoDate(request.endDate),
      startMinute: request.startMinute,
      endMinute: request.endMinute,
      active: true,
    })),
    weeklyAssignmentLimit: employee.weeklyAssignmentLimit,
    historicalAssignments: historicalCountByEmployee.get(employee.id) ?? 0,
    historicalTaskAssignments:
      historicalTaskCountByEmployee.get(employee.id) ?? {},
  }));

  const slots: SchedulerTaskSlot[] = scheduleDay.taskSlots.map((slot) => ({
    id: slot.id,
    date: input.date,
    taskTypeId: slot.taskTypeId,
    slotIndex: slot.slotIndex,
    startMinute: slot.startMinute,
    endMinute: slot.endMinute,
    minStaff: slot.minStaff,
    requiredStaff: slot.requiredStaff,
    lockedEmployeeId:
      slot.assignments.find((assignment) => assignment.locked)?.employeeId ?? null,
  }));

  const existingAssignments: ExistingAssignment[] = scheduleDay.taskSlots.flatMap(
    (slot) =>
      slot.assignments
        .filter((assignment) => assignment.locked)
        .map((assignment) => ({
          slotId: slot.id,
          employeeId: assignment.employeeId,
          date: input.date,
          taskTypeId: slot.taskTypeId,
          startMinute: slot.startMinute,
          endMinute: slot.endMinute,
          locked: true,
        })),
  );

  const schedulerInput = {
    seed: input.seed,
    employees: schedulerEmployees,
    taskTypes: [...taskTypes.values()],
    slots,
    existingAssignments,
  };

  const inputHash = createHash("sha256")
    .update(JSON.stringify(schedulerInput))
    .digest("hex");
  const result = generateSchedule(schedulerInput);

  const generationRun = await getDb().scheduleGenerationRun.create({
    data: {
      dateStart: parseIsoDate(input.date),
      dateEnd: parseIsoDate(input.date),
      seed: input.seed,
      engineVersion: SCHEDULER_ENGINE_VERSION,
      inputHash,
      requestedByEmployeeId: input.actorEmployeeId ?? undefined,
      status: "COMPLETED",
      completedAt: new Date(),
      summary: result.diagnostics,
    },
  });

  const lockedSlotIds = new Set(
    scheduleDay.taskSlots
      .filter((slot) => slot.assignments.some((assignment) => assignment.locked))
      .map((slot) => slot.id),
  );
  const slotIds = scheduleDay.taskSlots.map((slot) => slot.id);

  await getDb().assignment.updateMany({
    where: {
      taskSlotId: { in: slotIds },
      status: "ACTIVE",
      locked: false,
      source: {
        in: [
          AssignmentSource.GENERATED,
          AssignmentSource.COVERAGE_REPLACEMENT,
        ],
      },
    },
    data: {
      status: AssignmentStatus.REMOVED,
      removedAt: new Date(),
    },
  });

  for (const assignment of result.assignments) {
    if (assignment.source === "LOCKED" || lockedSlotIds.has(assignment.slotId)) {
      continue;
    }

    await getDb().assignment.create({
      data: {
        taskSlotId: assignment.slotId,
        employeeId: assignment.employeeId,
        source: "GENERATED",
        locked: false,
        generationRunId: generationRun.id,
      },
    });
  }

  const conflictSlotIds = new Set(result.conflicts.map((conflict) => conflict.slotId));
  const assignedSlotIds = new Set(
    result.assignments.map((assignment) => assignment.slotId),
  );

  for (const slotId of slotIds) {
    const status = conflictSlotIds.has(slotId)
      ? TaskSlotStatus.SHORTAGE
      : assignedSlotIds.has(slotId)
        ? TaskSlotStatus.FILLED
        : TaskSlotStatus.OPEN;

    await getDb().taskSlot.update({
      where: { id: slotId },
      data: { status },
    });
  }

  await getDb().scheduleDay.update({
    where: { id: scheduleDay.id },
    data: { status: "GENERATED" },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "schedule.generate",
    entityType: "ScheduleDay",
    entityId: scheduleDay.id,
    after: {
      generationRunId: generationRun.id,
      diagnostics: result.diagnostics,
    },
  });

  return result;
}
