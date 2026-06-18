import type { RequestStatus } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { recordPayrollLedgerEntry } from "@/lib/db/payroll";
import {
  calculateNptoHours,
  DEFAULT_NPTO_CAP_HOURS,
} from "@/lib/npto/policy";
import { regenerateExistingScheduleDaysForRange } from "@/lib/schedule/regeneration";
import { isShortNoticeForDateRange } from "@/lib/schedule/short-notice";
import type { NPTORequestFormValues } from "@/lib/validation/npto";
import { parseIsoDate, toIsoDate } from "@/lib/utils/date";

export async function getTimeOffSettings() {
  return getDb().timeOffSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      nptoCapHours: DEFAULT_NPTO_CAP_HOURS,
    },
  });
}

export function getNptoAdminPageData() {
  return Promise.all([
    getDb().nPTORequest.findMany({
      orderBy: [{ status: "asc" }, { startDate: "asc" }, { createdAt: "desc" }],
      include: {
        employee: true,
        reviewedBy: true,
      },
    }),
    getTimeOffSettings(),
  ]);
}

export async function updateNptoCap(input: {
  nptoCapHours: number;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await getTimeOffSettings();
  const settings = await db.timeOffSettings.update({
    where: { id: "default" },
    data: {
      nptoCapHours: input.nptoCapHours,
    },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "time_off_settings.update_npto_cap",
    entityType: "TimeOffSettings",
    entityId: settings.id,
    before,
    after: settings,
  });

  return settings;
}

export async function createNptoRequest(input: {
  values: NPTORequestFormValues;
  employeeId: string;
  actorEmployeeId?: string | null;
  action?: string;
}) {
  const createdAt = new Date();
  const requestHours = calculateNptoHours(input.values);
  const shortNotice = isShortNoticeForDateRange({
    createdAt,
    startDate: input.values.startDate,
    endDate: input.values.endDate,
  });

  const request = await getDb().nPTORequest.create({
    data: {
      employeeId: input.employeeId,
      status: "PENDING",
      startDate: parseIsoDate(input.values.startDate),
      endDate: parseIsoDate(input.values.endDate),
      startMinute: input.values.startMinute,
      endMinute: input.values.endMinute,
      requestedHours: requestHours,
      capSnapshotHours: DEFAULT_NPTO_CAP_HOURS,
      usedHoursAtSubmission: 0,
      shortNotice,
      reason: input.values.reason,
      createdAt,
    },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: input.action ?? "npto_request.create",
    entityType: "NPTORequest",
    entityId: request.id,
    after: request,
    metadata: { shortNotice, requestHours },
  });

  return request;
}

export async function reviewNptoRequest(input: {
  requestId: string;
  status: Extract<RequestStatus, "APPROVED" | "REJECTED">;
  managerNote?: string | null;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.nPTORequest.findUniqueOrThrow({
    where: { id: input.requestId },
  });

  if (before.status !== "PENDING") {
    throw new Error("Only pending NPTO requests can be reviewed.");
  }

  const reviewed = await db.nPTORequest.update({
    where: { id: input.requestId },
    data: {
      status: input.status,
      unpaidHours:
        input.status === "APPROVED" ? Number(before.requestedHours) : 0,
      denialReason:
        input.status === "REJECTED"
          ? input.managerNote ?? "Rejected by manager."
          : null,
      managerNote: input.managerNote,
      reviewedByEmployeeId: input.actorEmployeeId ?? null,
      reviewedAt: new Date(),
    },
  });

  const regeneratedDates =
    input.status === "APPROVED"
      ? await regenerateExistingScheduleDaysForNptoRequest({
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
        ? "npto_request.approve"
        : "npto_request.reject",
    entityType: "NPTORequest",
    entityId: reviewed.id,
    before,
    after: reviewed,
    metadata: {
      regeneratedDates,
      requestHours: Number(before.requestedHours),
    },
  });

  if (input.status === "APPROVED") {
    await recordPayrollLedgerEntry({
      employeeId: before.employeeId,
      type: "NPTO_UNPAID_DEDUCTION",
      hours: -Number(reviewed.unpaidHours),
      effectiveDate: toIsoDate(reviewed.startDate),
      sourceEntityType: "NPTORequest",
      sourceEntityId: reviewed.id,
      createdByEmployeeId: input.actorEmployeeId,
      metadata: {
        requestHours: Number(before.requestedHours),
        unpaidHours: Number(reviewed.unpaidHours),
        status: reviewed.status,
      },
      notes: "Approved NPTO unpaid deduction.",
    });
  }

  return { reviewed, regeneratedDates };
}

export async function overrideNptoRequest(input: {
  requestId: string;
  managerNote?: string | null;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.nPTORequest.findUniqueOrThrow({
    where: { id: input.requestId },
  });

  if (before.status === "APPROVED" || before.status === "OVERRIDDEN") {
    throw new Error("Approved NPTO is already schedule-blocking.");
  }

  const overridden = await db.nPTORequest.update({
    where: { id: input.requestId },
    data: {
      status: "OVERRIDDEN",
      unpaidHours: Number(before.requestedHours),
      managerNote: combineManagerNote(before.managerNote, input.managerNote),
      reviewedByEmployeeId: input.actorEmployeeId ?? null,
      reviewedAt: new Date(),
    },
  });

  const regeneratedDates = await regenerateExistingScheduleDaysForNptoRequest({
    requestId: overridden.id,
    startDate: toIsoDate(overridden.startDate),
    endDate: toIsoDate(overridden.endDate),
    actorEmployeeId: input.actorEmployeeId,
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "npto_request.override",
    entityType: "NPTORequest",
    entityId: overridden.id,
    before,
    after: overridden,
    metadata: { regeneratedDates },
  });

  await recordPayrollLedgerEntry({
    employeeId: before.employeeId,
    type: "NPTO_UNPAID_DEDUCTION",
    hours: -Number(overridden.unpaidHours),
    effectiveDate: toIsoDate(overridden.startDate),
    sourceEntityType: "NPTORequest",
    sourceEntityId: overridden.id,
    createdByEmployeeId: input.actorEmployeeId,
    metadata: {
      requestHours: Number(before.requestedHours),
      unpaidHours: Number(overridden.unpaidHours),
      status: overridden.status,
    },
    notes: "Manager override NPTO unpaid deduction.",
  });

  return { reviewed: overridden, regeneratedDates };
}

export async function reverseNptoApproval(input: {
  requestId: string;
  managerNote?: string | null;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.nPTORequest.findUniqueOrThrow({
    where: { id: input.requestId },
  });

  if (before.status !== "APPROVED" && before.status !== "OVERRIDDEN") {
    throw new Error("Only approved or overridden NPTO can be reversed.");
  }

  const reversed = await db.nPTORequest.update({
    where: { id: input.requestId },
    data: {
      status: "REVERSED",
      unpaidHours: 0,
      managerNote: combineManagerNote(before.managerNote, input.managerNote),
      reviewedByEmployeeId: input.actorEmployeeId ?? null,
      reviewedAt: new Date(),
    },
  });

  const regeneratedDates = await regenerateExistingScheduleDaysForNptoRequest({
    requestId: reversed.id,
    startDate: toIsoDate(reversed.startDate),
    endDate: toIsoDate(reversed.endDate),
    actorEmployeeId: input.actorEmployeeId,
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "npto_request.reverse_approval",
    entityType: "NPTORequest",
    entityId: reversed.id,
    before,
    after: reversed,
    metadata: {
      regeneratedDates,
      reversedUnpaidHours: Number(before.unpaidHours),
    },
  });

  await recordPayrollLedgerEntry({
    employeeId: before.employeeId,
    type: "REVERSAL_ADJUSTMENT",
    hours: Number(before.unpaidHours),
    effectiveDate: toIsoDate(reversed.startDate),
    sourceEntityType: "NPTORequest",
    sourceEntityId: reversed.id,
    createdByEmployeeId: input.actorEmployeeId,
    metadata: {
      requestHours: Number(before.requestedHours),
      reversedUnpaidHours: Number(before.unpaidHours),
      previousStatus: before.status,
    },
    notes: "NPTO reversal removed unpaid deduction.",
  });

  return { reviewed: reversed, regeneratedDates };
}

export async function returnNptoRequestToPending(input: {
  requestId: string;
  managerNote?: string | null;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.nPTORequest.findUniqueOrThrow({
    where: { id: input.requestId },
  });

  if (
    before.status !== "REJECTED" &&
    before.status !== "REVERSED" &&
    before.status !== "CANCELLED"
  ) {
    throw new Error("Only rejected, reversed, or cancelled NPTO can return to pending.");
  }

  const pending = await db.nPTORequest.update({
    where: { id: input.requestId },
    data: {
      status: "PENDING",
      unpaidHours: 0,
      denialReason: null,
      managerNote: combineManagerNote(before.managerNote, input.managerNote),
      reviewedByEmployeeId: null,
      reviewedAt: null,
    },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "npto_request.return_to_pending",
    entityType: "NPTORequest",
    entityId: pending.id,
    before,
    after: pending,
  });

  return pending;
}

export async function cancelNptoRequestAsAdmin(input: {
  requestId: string;
  managerNote?: string | null;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.nPTORequest.findUniqueOrThrow({
    where: { id: input.requestId },
  });

  if (before.status !== "PENDING" && before.status !== "REJECTED") {
    throw new Error("Only pending or rejected NPTO can be cancelled directly.");
  }

  const cancelled = await db.nPTORequest.update({
    where: { id: input.requestId },
    data: {
      status: "CANCELLED",
      unpaidHours: 0,
      managerNote: combineManagerNote(before.managerNote, input.managerNote),
      reviewedByEmployeeId: input.actorEmployeeId ?? null,
      reviewedAt: new Date(),
    },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "npto_request.admin_cancel",
    entityType: "NPTORequest",
    entityId: cancelled.id,
    before,
    after: cancelled,
  });

  return cancelled;
}

export async function cancelOwnNptoRequest(input: {
  requestId: string;
  employeeId: string;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.nPTORequest.findUniqueOrThrow({
    where: { id: input.requestId },
  });

  if (before.employeeId !== input.employeeId) {
    throw new Error("Forbidden");
  }

  if (before.status !== "PENDING") {
    throw new Error("Only pending NPTO requests can be cancelled.");
  }

  const cancelled = await db.nPTORequest.update({
    where: { id: input.requestId },
    data: {
      status: "CANCELLED",
      unpaidHours: 0,
    },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "npto_request.cancel",
    entityType: "NPTORequest",
    entityId: cancelled.id,
    before,
    after: cancelled,
  });

  return cancelled;
}

export async function getApprovedNptoHoursForEmployee(employeeId: string) {
  const result = await getDb().nPTORequest.aggregate({
    where: {
      employeeId,
      status: { in: ["APPROVED", "OVERRIDDEN"] },
    },
    _sum: {
      unpaidHours: true,
    },
  });

  return Number(result._sum.unpaidHours ?? 0);
}

async function regenerateExistingScheduleDaysForNptoRequest(input: {
  requestId: string;
  startDate: string;
  endDate: string;
  actorEmployeeId?: string | null;
}) {
  return regenerateExistingScheduleDaysForRange({
    seedPrefix: `npto-${input.requestId}`,
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
