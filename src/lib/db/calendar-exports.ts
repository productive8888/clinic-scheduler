import { ExportStatus, ExportType } from "@prisma/client";
import { buildAssignmentCalendarEvents } from "@/lib/calendar/events";
import { getDb } from "@/lib/db";

export async function getClinicCalendarEvents() {
  const scheduleDays = await getPublishedScheduleDaysForExport();

  return buildAssignmentCalendarEvents({ scheduleDays });
}

export async function getEmployeeCalendarEvents(employeeId: string) {
  const scheduleDays = await getPublishedScheduleDaysForExport(employeeId);

  return buildAssignmentCalendarEvents({ scheduleDays, employeeId });
}

export function createCalendarExportLog(input: {
  requestedByEmployeeId?: string | null;
  scope: "clinic" | "employee";
  eventCount: number;
}) {
  return getDb().exportLog.create({
    data: {
      type: ExportType.ICS_CALENDAR,
      status: ExportStatus.COMPLETED,
      requestedByEmployeeId: input.requestedByEmployeeId ?? undefined,
      metadata: {
        scope: input.scope,
        eventCount: input.eventCount,
      },
      completedAt: new Date(),
    },
  });
}

function getPublishedScheduleDaysForExport(employeeId?: string) {
  return getDb().scheduleDay.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { date: "asc" },
    include: {
      taskSlots: {
        where: { status: { not: "CANCELLED" } },
        orderBy: [
          { taskType: { sortOrder: "asc" } },
          { slotIndex: "asc" },
        ],
        include: {
          taskType: true,
          assignments: {
            where: {
              status: "ACTIVE",
              ...(employeeId ? { employeeId } : {}),
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
