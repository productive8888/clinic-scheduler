import {
  ExportStatus,
  ExportType,
  ScheduleDayStatus,
} from "@prisma/client";
import { buildAssignmentCalendarEvents } from "@/lib/calendar/events";
import { getDb } from "@/lib/db";
import { parseIsoDate } from "@/lib/utils/date";

export async function getClinicCalendarEvents(input?: {
  startDate?: string;
  endDate?: string;
  includeDraft?: boolean;
}) {
  const scheduleDays = await getScheduleDaysForExport(input);

  return buildAssignmentCalendarEvents({
    scheduleDays,
    includeStatuses: exportStatuses(Boolean(input?.includeDraft)),
  });
}

export async function getEmployeeCalendarEvents(employeeId: string) {
  const scheduleDays = await getScheduleDaysForExport({ employeeId });

  return buildAssignmentCalendarEvents({ scheduleDays, employeeId });
}

export function createCalendarExportLog(input: {
  requestedByEmployeeId?: string | null;
  scope: "clinic" | "employee";
  eventCount: number;
  startDate?: string | null;
  endDate?: string | null;
  includeDraft?: boolean;
}) {
  return getDb().exportLog.create({
    data: {
      type: ExportType.ICS_CALENDAR,
      status: ExportStatus.COMPLETED,
      requestedByEmployeeId: input.requestedByEmployeeId ?? undefined,
      metadata: {
        scope: input.scope,
        eventCount: input.eventCount,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        includeDraft: Boolean(input.includeDraft),
      },
      completedAt: new Date(),
    },
  });
}

function getScheduleDaysForExport(input?: {
  employeeId?: string;
  startDate?: string;
  endDate?: string;
  includeDraft?: boolean;
}) {
  const statuses = exportStatuses(Boolean(input?.includeDraft));

  return getDb().scheduleDay.findMany({
    where: {
      status: { in: statuses as ScheduleDayStatus[] },
      ...(input?.startDate || input?.endDate
        ? {
            date: {
              ...(input.startDate
                ? { gte: parseIsoDate(input.startDate) }
                : {}),
              ...(input.endDate
                ? { lte: parseIsoDate(input.endDate) }
                : {}),
            },
          }
        : {}),
    },
    orderBy: { date: "asc" },
    include: {
      taskSlots: {
        where: { status: { not: "CANCELLED" } },
        orderBy: [
          { shiftBlock: { startMinute: "asc" } },
          { taskType: { sortOrder: "asc" } },
          { slotIndex: "asc" },
        ],
        include: {
          taskType: true,
          shiftBlock: {
            select: {
              name: true,
              shiftCategory: true,
            },
          },
          assignments: {
            where: {
              status: "ACTIVE",
              ...(input?.employeeId
                ? { employeeId: input.employeeId }
                : {}),
            },
            include: {
              employee: true,
            },
            orderBy: [{ employee: { fullName: "asc" } }, { id: "asc" }],
          },
        },
      },
    },
  });
}

function exportStatuses(includeDraft: boolean) {
  return includeDraft
    ? [
        ScheduleDayStatus.DRAFT,
        ScheduleDayStatus.GENERATED,
        ScheduleDayStatus.NEEDS_REGENERATION,
        ScheduleDayStatus.LOCKED,
        ScheduleDayStatus.PUBLISHED,
      ]
    : [ScheduleDayStatus.PUBLISHED];
}
