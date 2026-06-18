import type { RequestStatus } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { recordPayrollLedgerEntry } from "@/lib/db/payroll";
import {
  calculatePtoHours,
  deductsPtoBalance,
  PTO_BALANCE_APPROVAL_FLOOR_HOURS,
  wouldPutPtoBalanceBelowFloor,
} from "@/lib/pto/policy";
import { regenerateExistingScheduleDaysForRange } from "@/lib/schedule/regeneration";
import { isShortNoticeForDateRange } from "@/lib/schedule/short-notice";
import type { PTORequestFormValues } from "@/lib/validation/pto";
import { parseIsoDate, toIsoDate } from "@/lib/utils/date";

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
  const createdAt = new Date();
  const shortNotice = isShortNoticeForDateRange({
    createdAt,
    startDate: input.values.startDate,
    endDate: input.values.endDate,
  });
  const request = await getDb().pTORequest.create({
    data: {
      employeeId: input.employeeId,
      type: input.values.type,
      status: "PENDING",
      startDate: parseIsoDate(input.values.startDate),
      endDate: parseIsoDate(input.values.endDate),
      startMinute: input.values.startMinute,
      endMinute: input.values.endMinute,
      shortNotice,
      reason: input.values.reason,
      createdAt,
    },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: input.action ?? "pto_request.create",
    entityType: "PTORequest",
    entityId: request.id,
    after: request,
    metadata: { shortNotice },
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

  const requestHours = calculatePtoHours({
    startDate: toIsoDate(before.startDate),
    endDate: toIsoDate(before.endDate),
    startMinute: before.startMinute,
    endMinute: before.endMinute,
  });

  const reviewed = await db.$transaction(async (tx) => {
    let currentBalanceHours = Number(before.employee.ptoBalanceHours);

    if (input.status === "APPROVED" && deductsPtoBalance(before.type)) {
      const lockedRows = await tx.$queryRaw<
        Array<{ ptoBalanceHours: { toString(): string } }>
      >`
        SELECT "ptoBalanceHours"
        FROM "Employee"
        WHERE "id" = ${before.employeeId}
        FOR UPDATE
      `;

      if (!lockedRows[0]) {
        throw new Error("Employee not found.");
      }

      currentBalanceHours = Number(lockedRows[0].ptoBalanceHours);

      if (
        wouldPutPtoBalanceBelowFloor({
          currentBalanceHours,
          requestHours,
        })
      ) {
        throw new Error(
          `Approval would put PTO balance below ${PTO_BALANCE_APPROVAL_FLOOR_HOURS} hours. Use manager override if this is intentional.`,
        );
      }
    }

    const updated = await tx.pTORequest.update({
      where: { id: input.requestId },
      data: {
        status: input.status,
        managerNote: input.managerNote,
        reviewedByEmployeeId: input.actorEmployeeId ?? null,
        reviewedAt: new Date(),
      },
    });

    if (input.status === "APPROVED" && deductsPtoBalance(before.type)) {
      await tx.employee.update({
        where: { id: before.employeeId },
        data: {
          ptoBalanceHours: {
            decrement: requestHours,
          },
        },
      });
    }

    return updated;
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

  if (input.status === "APPROVED" && deductsPtoBalance(before.type)) {
    await recordPayrollLedgerEntry({
      employeeId: before.employeeId,
      type: "PTO_DEBIT",
      hours: -requestHours,
      effectiveDate: toIsoDate(reviewed.startDate),
      sourceEntityType: "PTORequest",
      sourceEntityId: reviewed.id,
      createdByEmployeeId: input.actorEmployeeId,
      metadata: {
        requestHours,
        requestType: before.type,
        status: reviewed.status,
      },
      notes: "Approved PTO balance debit.",
    });
  }

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
    metadata: { regeneratedDates, requestHours },
  });

  return { reviewed, regeneratedDates };
}

export async function overridePtoRequest(input: {
  requestId: string;
  managerNote?: string | null;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.pTORequest.findUniqueOrThrow({
    where: { id: input.requestId },
  });

  if (before.status === "APPROVED" || before.status === "OVERRIDDEN") {
    throw new Error("Approved PTO is already schedule-blocking.");
  }

  const requestHours = calculatePtoHours({
    startDate: toIsoDate(before.startDate),
    endDate: toIsoDate(before.endDate),
    startMinute: before.startMinute,
    endMinute: before.endMinute,
  });

  const overridden = await db.$transaction(async (tx) => {
    const updated = await tx.pTORequest.update({
      where: { id: input.requestId },
      data: {
        status: "OVERRIDDEN",
        managerNote: combineManagerNote(before.managerNote, input.managerNote),
        reviewedByEmployeeId: input.actorEmployeeId ?? null,
        reviewedAt: new Date(),
      },
    });

    if (deductsPtoBalance(before.type)) {
      await tx.employee.update({
        where: { id: before.employeeId },
        data: {
          ptoBalanceHours: {
            decrement: requestHours,
          },
        },
      });
    }

    return updated;
  });

  const regeneratedDates = await regenerateExistingScheduleDaysForRequest({
    requestId: overridden.id,
    startDate: toIsoDate(overridden.startDate),
    endDate: toIsoDate(overridden.endDate),
    actorEmployeeId: input.actorEmployeeId,
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "pto_request.override",
    entityType: "PTORequest",
    entityId: overridden.id,
    before,
    after: overridden,
    metadata: { regeneratedDates },
  });

  if (deductsPtoBalance(before.type)) {
    await recordPayrollLedgerEntry({
      employeeId: before.employeeId,
      type: "PTO_DEBIT",
      hours: -requestHours,
      effectiveDate: toIsoDate(overridden.startDate),
      sourceEntityType: "PTORequest",
      sourceEntityId: overridden.id,
      createdByEmployeeId: input.actorEmployeeId,
      metadata: {
        requestHours,
        requestType: before.type,
        status: overridden.status,
      },
      notes: "Manager override PTO balance debit.",
    });
  }

  return { reviewed: overridden, regeneratedDates };
}

export async function reversePtoApproval(input: {
  requestId: string;
  managerNote?: string | null;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.pTORequest.findUniqueOrThrow({
    where: { id: input.requestId },
    include: { employee: true },
  });

  if (before.status !== "APPROVED" && before.status !== "OVERRIDDEN") {
    throw new Error("Only approved or overridden PTO can be reversed.");
  }

  const requestHours = calculatePtoHours({
    startDate: toIsoDate(before.startDate),
    endDate: toIsoDate(before.endDate),
    startMinute: before.startMinute,
    endMinute: before.endMinute,
  });

  const reversed = await db.$transaction(async (tx) => {
    const updated = await tx.pTORequest.update({
      where: { id: input.requestId },
      data: {
        status: "REVERSED",
        managerNote: combineManagerNote(before.managerNote, input.managerNote),
        reviewedByEmployeeId: input.actorEmployeeId ?? null,
        reviewedAt: new Date(),
      },
    });

    if (deductsPtoBalance(before.type)) {
      await tx.employee.update({
        where: { id: before.employeeId },
        data: {
          ptoBalanceHours: {
            increment: requestHours,
          },
        },
      });
    }

    return updated;
  });

  const regeneratedDates = await regenerateExistingScheduleDaysForRequest({
    requestId: reversed.id,
    startDate: toIsoDate(reversed.startDate),
    endDate: toIsoDate(reversed.endDate),
    actorEmployeeId: input.actorEmployeeId,
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "pto_request.reverse_approval",
    entityType: "PTORequest",
    entityId: reversed.id,
    before,
    after: reversed,
    metadata: { regeneratedDates, restoredHours: requestHours },
  });

  if (deductsPtoBalance(before.type)) {
    await recordPayrollLedgerEntry({
      employeeId: before.employeeId,
      type: "REVERSAL_ADJUSTMENT",
      hours: requestHours,
      effectiveDate: toIsoDate(reversed.startDate),
      sourceEntityType: "PTORequest",
      sourceEntityId: reversed.id,
      createdByEmployeeId: input.actorEmployeeId,
      metadata: {
        requestHours,
        requestType: before.type,
        previousStatus: before.status,
      },
      notes: "PTO reversal restored balance.",
    });
  }

  return { reviewed: reversed, regeneratedDates };
}

export async function returnPtoRequestToPending(input: {
  requestId: string;
  managerNote?: string | null;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.pTORequest.findUniqueOrThrow({
    where: { id: input.requestId },
  });

  if (
    before.status !== "REJECTED" &&
    before.status !== "REVERSED" &&
    before.status !== "CANCELLED"
  ) {
    throw new Error("Only rejected, reversed, or cancelled PTO can return to pending.");
  }

  const pending = await db.pTORequest.update({
    where: { id: input.requestId },
    data: {
      status: "PENDING",
      managerNote: combineManagerNote(before.managerNote, input.managerNote),
      reviewedByEmployeeId: null,
      reviewedAt: null,
    },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "pto_request.return_to_pending",
    entityType: "PTORequest",
    entityId: pending.id,
    before,
    after: pending,
  });

  return pending;
}

export async function cancelPtoRequestAsAdmin(input: {
  requestId: string;
  managerNote?: string | null;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.pTORequest.findUniqueOrThrow({
    where: { id: input.requestId },
  });

  if (before.status !== "PENDING" && before.status !== "REJECTED") {
    throw new Error("Only pending or rejected PTO can be cancelled directly.");
  }

  const cancelled = await db.pTORequest.update({
    where: { id: input.requestId },
    data: {
      status: "CANCELLED",
      managerNote: combineManagerNote(before.managerNote, input.managerNote),
      reviewedByEmployeeId: input.actorEmployeeId ?? null,
      reviewedAt: new Date(),
    },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "pto_request.admin_cancel",
    entityType: "PTORequest",
    entityId: cancelled.id,
    before,
    after: cancelled,
  });

  return cancelled;
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
  return regenerateExistingScheduleDaysForRange({
    seedPrefix: `pto-${input.requestId}`,
    startDate: input.startDate,
    endDate: input.endDate,
    actorEmployeeId: input.actorEmployeeId,
  });
}

function combineManagerNote(
  existingNote: string | null,
  newNote: string | null | undefined,
) {
  if (!newNote) {
    return existingNote;
  }

  return existingNote ? `${existingNote}\n${newNote}` : newNote;
}
