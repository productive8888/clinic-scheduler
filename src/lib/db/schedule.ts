import { createHash } from "node:crypto";
import {
  AssignmentSource,
  AssignmentStatus,
  Prisma,
  TaskSlotStatus,
} from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import {
  generateSchedule,
  isUnavailableForSlot,
  SCHEDULER_ENGINE_VERSION,
  type ExistingAssignment,
  type SchedulerEmployee,
  type SchedulerTaskSlot,
  type SchedulerTaskType,
} from "@/lib/scheduler";
import { parseIsoDate, toIsoDate } from "@/lib/utils/date";

const DEFAULT_SLOT_START_MINUTE = 8 * 60;
const DEFAULT_SLOT_END_MINUTE = 17 * 60;

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
      publishedBy: true,
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
    const slot = await db.taskSlot.upsert({
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
        startMinute: DEFAULT_SLOT_START_MINUTE,
        endMinute: DEFAULT_SLOT_END_MINUTE,
        status: "OPEN",
        minStaff: 1,
        requiredStaff: 1,
      },
    });

    if (slot.startMinute === null || slot.endMinute === null) {
      await db.taskSlot.update({
        where: { id: slot.id },
        data: {
          startMinute: slot.startMinute ?? DEFAULT_SLOT_START_MINUTE,
          endMinute: slot.endMinute ?? DEFAULT_SLOT_END_MINUTE,
        },
      });
    }
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
        notes: null,
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

  const [scheduleDay, employees, historicalAssignments, rules] = await Promise.all([
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
      orderBy: [{ employeeId: "asc" }, { taskSlotId: "asc" }, { id: "asc" }],
    }),
    getDb().schedulingRule.findMany({
      where: {
        active: true,
        AND: [
          {
            OR: [
              { effectiveStartDate: null },
              { effectiveStartDate: { lte: parseIsoDate(input.date) } },
            ],
          },
          {
            OR: [
              { effectiveEndDate: null },
              { effectiveEndDate: { gte: parseIsoDate(input.date) } },
            ],
          },
        ],
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }, { id: "asc" }],
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

  const schedulerEmployees: SchedulerEmployee[] = employees
    .map((employee) => ({
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
      unavailable: employee.ptoRequests
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
      historicalAssignments: historicalCountByEmployee.get(employee.id) ?? 0,
      historicalTaskAssignments: sortNumberRecord(
        historicalTaskCountByEmployee.get(employee.id) ?? {},
      ),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const slots: SchedulerTaskSlot[] = scheduleDay.taskSlots.map((slot) => ({
    id: slot.id,
    date: input.date,
    taskTypeId: slot.taskTypeId,
    slotIndex: slot.slotIndex,
    startMinute: slot.startMinute,
    endMinute: slot.endMinute,
    minStaff: slot.minStaff,
    requiredStaff: slot.requiredStaff,
    lockedEmployeeIds: slot.assignments
      .filter((assignment) => assignment.locked)
      .map((assignment) => assignment.employeeId)
      .sort(),
  }));

  const existingAssignments: ExistingAssignment[] = [];

  const schedulerInput = {
    seed: input.seed,
    employees: schedulerEmployees,
    taskTypes: [...taskTypes.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    slots,
    rules: rules.map((rule) => ({
      id: rule.id,
      type: rule.type,
      employeeId: rule.employeeId,
      taskTypeId: rule.taskTypeId,
      weight: rule.weight,
      priority: rule.priority,
      active: rule.active,
      effectiveStartDate: rule.effectiveStartDate
        ? toIsoDate(rule.effectiveStartDate)
        : null,
      effectiveEndDate: rule.effectiveEndDate ? toIsoDate(rule.effectiveEndDate) : null,
      parameters: jsonRecord(rule.parameters),
    })),
    existingAssignments,
  };

  const inputHash = createHash("sha256")
    .update(stableStringify(schedulerInput))
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
    if (assignment.source === "LOCKED") {
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
  const conflictsBySlotId = new Map(
    result.conflicts.map((conflict) => [conflict.slotId, conflict]),
  );
  const employeesById = new Map(
    schedulerEmployees.map((employee) => [employee.id, employee]),
  );
  const schedulerSlotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const lockedPtoConflictsBySlotId = new Map<string, string>();

  for (const slot of scheduleDay.taskSlots) {
    const schedulerSlot = schedulerSlotsById.get(slot.id);

    if (!schedulerSlot) {
      continue;
    }

    const lockedConflictNames = slot.assignments
      .filter((assignment) => assignment.locked)
      .filter((assignment) => {
        const employee = employeesById.get(assignment.employeeId);

        return employee ? isUnavailableForSlot(employee, schedulerSlot) : false;
      })
      .map((assignment) => assignment.employee.fullName);

    if (lockedConflictNames.length > 0) {
      lockedPtoConflictsBySlotId.set(
        slot.id,
        `Locked assignment conflicts with approved PTO/unavailability: ${lockedConflictNames.join(", ")}`,
      );
    }
  }

  const assignedSlotIds = new Set(
    result.assignments.map((assignment) => assignment.slotId),
  );

  for (const slotId of slotIds) {
    const status =
      conflictSlotIds.has(slotId) || lockedPtoConflictsBySlotId.has(slotId)
        ? TaskSlotStatus.SHORTAGE
        : assignedSlotIds.has(slotId)
          ? TaskSlotStatus.FILLED
          : TaskSlotStatus.OPEN;

    await getDb().taskSlot.update({
      where: { id: slotId },
      data: {
        status,
        notes:
          lockedPtoConflictsBySlotId.get(slotId) ??
          (conflictsBySlotId.has(slotId)
            ? formatConflictNote(conflictsBySlotId.get(slotId)!)
            : null),
      },
    });
  }

  await getDb().scheduleDay.update({
    where: { id: scheduleDay.id },
    data: {
      status: "GENERATED",
      publishedAt: null,
      publishedByEmployeeId: null,
    },
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

export async function publishScheduleForDate(input: {
  date: string;
  actorEmployeeId?: string | null;
}) {
  const scheduleDay = await getScheduleBoard(input.date);

  if (!scheduleDay) {
    throw new Error("Prepare and generate a schedule before publishing.");
  }

  const shortageCount = scheduleDay.taskSlots.filter(
    (slot) => slot.status === "SHORTAGE" || slot.assignments.length < slot.requiredStaff,
  ).length;

  if (shortageCount > 0) {
    throw new Error("Resolve all shortages before publishing the schedule.");
  }

  const published = await getDb().scheduleDay.update({
    where: { id: scheduleDay.id },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      publishedByEmployeeId: input.actorEmployeeId ?? undefined,
    },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "schedule.publish",
    entityType: "ScheduleDay",
    entityId: published.id,
    before: { status: scheduleDay.status },
    after: { status: published.status, publishedAt: published.publishedAt },
  });

  return published;
}

function formatConflictNote(conflict: {
  reason: string;
  rejectedCandidates: { employeeId: string; reasons: string[] }[];
}) {
  const rejectionSummary = conflict.rejectedCandidates
    .slice(0, 4)
    .map((candidate) => `${candidate.employeeId}: ${candidate.reasons.join(", ")}`)
    .join(" | ");

  return rejectionSummary
    ? `${conflict.reason}. ${rejectionSummary}`
    : conflict.reason;
}

function jsonRecord(value: Prisma.JsonValue) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function sortNumberRecord(record: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}
