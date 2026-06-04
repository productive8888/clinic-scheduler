import { writeAuditLog } from "@/lib/audit";
import {
  backgroundSlotCount,
  enumerateBackgroundPeriods,
} from "@/lib/background/periods";
import { backgroundTaskDisplayName } from "@/lib/background/display";
import { getDb } from "@/lib/db";
import {
  ensureScheduleDayWithDefaultSlots,
  getScheduleBoard,
} from "@/lib/db/schedule";
import {
  enumerateIsoDates,
  parseIsoDate,
} from "@/lib/utils/date";

export type BackgroundGenerationSummary = {
  startDate: string;
  endDate: string;
  definitionCount: number;
  instanceCount: number;
  slotsCreated: number;
  skippedDefinitions: string[];
  skippedPeriods: string[];
};

export async function generateBackgroundTaskSlotsForRange(input: {
  startDate: string;
  endDate: string;
  allowedDates?: string[];
  includePublished?: boolean;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const definitions = await db.backgroundTaskDefinition.findMany({
    where: {
      active: true,
      taskTypeId: { not: null },
      taskType: { active: true, isBackground: true },
    },
    orderBy: [{ priority: "asc" }, { name: "asc" }, { id: "asc" }],
    include: {
      taskType: true,
    },
  });
  const summary: BackgroundGenerationSummary = {
    startDate: input.startDate,
    endDate: input.endDate,
    definitionCount: definitions.length,
    instanceCount: 0,
    slotsCreated: 0,
    skippedDefinitions: [],
    skippedPeriods: [],
  };

  for (const definition of definitions) {
    if (!definition.taskTypeId || !definition.taskType) {
      summary.skippedDefinitions.push(definition.name);
      continue;
    }

    const periods = enumerateBackgroundPeriods({
      startDate: input.startDate,
      endDate: input.endDate,
      definition,
    });

    for (const period of periods) {
      const placementOptions = await getPlacementOptions({
        startDate:
          period.startDate < input.startDate ? input.startDate : period.startDate,
        endDate: period.endDate > input.endDate ? input.endDate : period.endDate,
        allowedDates: input.allowedDates,
        includePublished: input.includePublished,
        actorEmployeeId: input.actorEmployeeId,
      });

      if (placementOptions.length === 0) {
        summary.skippedPeriods.push(
          `${definition.name}: ${period.startDate} to ${period.endDate}`,
        );
        continue;
      }

      const instance = await db.backgroundTaskInstance.upsert({
        where: {
          definitionId_periodStartDate_periodEndDate: {
            definitionId: definition.id,
            periodStartDate: parseIsoDate(period.startDate),
            periodEndDate: parseIsoDate(period.endDate),
          },
        },
        update: {
          dueDate: parseIsoDate(period.endDate),
          estimatedHours: definition.estimatedHoursPerPeriod,
          prioritySnapshot: definition.priority,
          status: "OPEN",
        },
        create: {
          definitionId: definition.id,
          periodStartDate: parseIsoDate(period.startDate),
          periodEndDate: parseIsoDate(period.endDate),
          dueDate: parseIsoDate(period.endDate),
          estimatedHours: definition.estimatedHoursPerPeriod,
          prioritySnapshot: definition.priority,
          status: "OPEN",
        },
        include: {
          taskSlots: {
            where: { status: { not: "CANCELLED" } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
        },
      });
      summary.instanceCount += 1;

      const targetSlotCount = backgroundSlotCount({
        requiredCountPerPeriod: definition.requiredCountPerPeriod,
        estimatedHoursPerPeriod: Number(definition.estimatedHoursPerPeriod),
        paidHoursPerSlot: Number(placementOptions[0].paidHours),
      });
      const slotsNeeded = Math.max(0, targetSlotCount - instance.taskSlots.length);

      for (let index = 0; index < slotsNeeded; index += 1) {
        const placement =
          placementOptions[(instance.taskSlots.length + index) % placementOptions.length];
        const existingMax = await db.taskSlot.aggregate({
          where: {
            scheduleDayId: placement.scheduleDayId,
            shiftBlockId: placement.shiftBlockId,
            taskTypeId: definition.taskTypeId,
          },
          _max: { slotIndex: true },
        });
        const slotIndex = (existingMax._max.slotIndex ?? 0) + 1;

        await db.taskSlot.create({
          data: {
            scheduleDayId: placement.scheduleDayId,
            shiftBlockId: placement.shiftBlockId,
            taskTypeId: definition.taskTypeId,
            backgroundTaskInstanceId: instance.id,
            slotIndex,
            label: backgroundTaskDisplayName({
              name: definition.name,
              isBackground: true,
            }),
            startMinute: placement.startMinute,
            endMinute: placement.endMinute,
            minStaff: 0,
            requiredStaff: 1,
            requirementLevel: "OPTIONAL",
            source: "BACKGROUND_DEFINITION",
            status: "OPEN",
            notes: `${formatPeriodLabel(definition.periodType)} obligation due ${period.endDate}. Priority ${definition.priority}.`,
          },
        });
        summary.slotsCreated += 1;
      }
    }
  }

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "background_task_slots.generate",
    entityType: "ScheduleRange",
    entityId: `${input.startDate}:${input.endDate}`,
    after: summary,
  });

  return summary;
}

async function getPlacementOptions(input: {
  startDate: string;
  endDate: string;
  allowedDates?: string[];
  includePublished?: boolean;
  actorEmployeeId?: string | null;
}) {
  const placements: Array<{
    date: string;
    scheduleDayId: string;
    shiftBlockId: string;
    startMinute: number;
    endMinute: number;
    paidHours: number;
  }> = [];

  const allowedDates = input.allowedDates ? new Set(input.allowedDates) : null;

  for (const date of enumerateIsoDates(input.startDate, input.endDate)) {
    if (allowedDates && !allowedDates.has(date)) {
      continue;
    }

    if (parseIsoDate(date).getUTCDay() === 0) {
      continue;
    }

    await ensureScheduleDayWithDefaultSlots(date, input.actorEmployeeId);
    const board = await getScheduleBoard(date);

    if (
      !board ||
      board.scenario === "CLINIC_CLOSED" ||
      (board.status === "PUBLISHED" && !input.includePublished)
    ) {
      continue;
    }

    const shiftBlock =
      board.shiftBlocks.find((block) => block.defaultForSchedule) ??
      board.shiftBlocks[0];

    if (!shiftBlock) {
      continue;
    }

    placements.push({
      date,
      scheduleDayId: board.id,
      shiftBlockId: shiftBlock.id,
      startMinute: shiftBlock.startMinute,
      endMinute: shiftBlock.endMinute,
      paidHours: Number(shiftBlock.paidHours),
    });
  }

  return placements.sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.startMinute - right.startMinute ||
      left.shiftBlockId.localeCompare(right.shiftBlockId),
  );
}

function formatPeriodLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}
