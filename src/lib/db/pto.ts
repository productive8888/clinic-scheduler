import type { RequestStatus } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { generateScheduleForDate } from "@/lib/db/schedule";
import type { PTORequestFormValues } from "@/lib/validation/pto";
import { enumerateIsoDates, parseIsoDate, toIsoDate } from "@/lib/utils/date";

export function getPtoAdminPageData() {
  return Promise.all([
    getDb().pTORequest.findMany({
      orderBy: [{ status: "asc" }, { startDate: "asc" }, { createdAt: "desc" }],
      include: {
        employee: true,
        reviewedBy: true,
      },
    }),
    getDb().employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        email: true,
        ptoBalanceHours: true,
      },
    }),
  ]);
}

export function getEmployeePtoPageData(employeeId: string) {
  return Promise.all([
    getDb().employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        fullName: true,
        ptoBalanceHours: true,
      },
    }),
    getDb().pTORequest.findMany({
      where: { employeeId },
      orderBy: [{ createdAt: "desc" }, { startDate: "desc" }],
      include: {
        employee: true,
        reviewedBy: true,
      },
      take: 20,
    }),
  ]);
}

export async function createPtoRequest(input: {
  values: PTORequestFormValues;
  employeeId: string;
  actorEmployeeId?: string | null;
  action?: string;
}) {
  const request = await getDb().pTORequest.create({
    data: {
      employeeId: input.employeeId,
      type: input.values.type,
      startDate: parseIsoDate(input.values.startDate),
      endDate: parseIsoDate(input.values.endDate),
      startMinute: input.values.startMinute,
      endMinute: input.values.endMinute,
      reason: input.values.reason,
    },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: input.action ?? "pto_request.create",
    entityType: "PTORequest",
    entityId: request.id,
    after: request,
  });

  return request;
}

export async function reviewPtoRequest(input: {
  requestId: string;
  status: Extract<RequestStatus, "APPROVED" | "REJECTED">;
  managerNote?: string | null;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.pTORequest.findUniqueOrThrow({
    where: { id: input.requestId },
    include: { employee: true },
  });

  if (before.status !== "PENDING") {
    throw new Error("Only pending PTO requests can be reviewed.");
  }

  const reviewed = await db.pTORequest.update({
    where: { id: input.requestId },
    data: {
      status: input.status,
      managerNote: input.managerNote,
      reviewedByEmployeeId: input.actorEmployeeId ?? null,
      reviewedAt: new Date(),
    },
  });

  const regeneratedDates =
    input.status === "APPROVED"
      ? await regenerateExistingScheduleDaysForRequest({
          requestId: reviewed.id,
          startDate: toIsoDate(reviewed.startDate),
          endDate: toIsoDate(reviewed.endDate),
          actorEmployeeId: input.actorEmployeeId,
        })
      : [];

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action:
      input.status === "APPROVED"
        ? "pto_request.approve"
        : "pto_request.reject",
    entityType: "PTORequest",
    entityId: reviewed.id,
    before,
    after: reviewed,
    metadata: { regeneratedDates },
  });

  return { reviewed, regeneratedDates };
}

export async function cancelOwnPtoRequest(input: {
  requestId: string;
  employeeId: string;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.pTORequest.findUniqueOrThrow({
    where: { id: input.requestId },
  });

  if (before.employeeId !== input.employeeId) {
    throw new Error("Forbidden");
  }

  if (before.status !== "PENDING") {
    throw new Error("Only pending PTO requests can be cancelled.");
  }

  const cancelled = await db.pTORequest.update({
    where: { id: input.requestId },
    data: { status: "CANCELLED" },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "pto_request.cancel",
    entityType: "PTORequest",
    entityId: cancelled.id,
    before,
    after: cancelled,
  });

  return cancelled;
}

async function regenerateExistingScheduleDaysForRequest(input: {
  requestId: string;
  startDate: string;
  endDate: string;
  actorEmployeeId?: string | null;
}) {
  const candidateDates = enumerateIsoDates(input.startDate, input.endDate);
  const scheduleDays = await getDb().scheduleDay.findMany({
    where: {
      date: {
        in: candidateDates.map(parseIsoDate),
      },
      status: { not: "LOCKED" },
    },
    orderBy: { date: "asc" },
    select: { date: true },
  });

  const regeneratedDates: string[] = [];

  for (const scheduleDay of scheduleDays) {
    const date = toIsoDate(scheduleDay.date);

    await generateScheduleForDate({
      date,
      seed: `pto-${input.requestId}-${date}`,
      actorEmployeeId: input.actorEmployeeId,
    });
    regeneratedDates.push(date);
  }

  return regeneratedDates;
}
