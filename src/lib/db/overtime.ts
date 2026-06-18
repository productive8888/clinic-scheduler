import { Prisma, type RequestStatus } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { recordPayrollLedgerEntry } from "@/lib/db/payroll";
import {
  calculateOvertimeApproval,
  calculateOvertimeReversal,
} from "@/lib/overtime/policy";
import type { OvertimeEntryValues } from "@/lib/validation/overtime";
import { parseIsoDate, toIsoDate } from "@/lib/utils/date";

export function getOvertimeAdminPageData() {
  return Promise.all([
    getDb().overtimeRequest.findMany({
      orderBy: [
        { status: "asc" },
        { workDate: "desc" },
        { createdAt: "desc" },
      ],
      include: {
        employee: true,
        reviewedBy: true,
      },
    }),
    getDb().employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      select: {
        id: true,
        fullName: true,
        email: true,
        optoBalanceHours: true,
      },
    }),
  ]);
}

export async function createOvertimeEntry(input: {
  employeeId: string;
  values: OvertimeEntryValues;
  actorEmployeeId?: string | null;
  action?: string;
}) {
  const request = await getDb().overtimeRequest.create({
    data: {
      employeeId: input.employeeId,
      workDate: parseIsoDate(input.values.workDate),
      requestedHours: input.values.requestedHours,
      reason: input.values.reason,
      status: "PENDING",
    },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: input.action ?? "overtime_entry.create",
    entityType: "OvertimeRequest",
    entityId: request.id,
    after: request,
  });

  return request;
}

export async function reviewOvertimeEntry(input: {
  requestId: string;
  status: Extract<RequestStatus, "APPROVED" | "REJECTED">;
  rejectionReason?: string | null;
  actorEmployeeId?: string | null;
}) {
  return input.status === "APPROVED"
    ? approveOvertimeEntry(input)
    : rejectOvertimeEntry(input);
}

async function approveOvertimeEntry(input: {
  requestId: string;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();

  return db.$transaction(async (tx) => {
    const before = await tx.overtimeRequest.findUniqueOrThrow({
      where: { id: input.requestId },
      include: { employee: true },
    });

    if (before.status !== "PENDING") {
      throw new Error("Only pending overtime entries can be approved.");
    }

    const approval = calculateOvertimeApproval({
      requestedHours: Number(before.requestedHours),
      optoBalanceHours: Number(before.employee.optoBalanceHours),
    });
    const claimed = await tx.overtimeRequest.updateMany({
      where: { id: before.id, status: "PENDING" },
      data: {
        status: "APPROVED",
        reviewedByEmployeeId: input.actorEmployeeId ?? null,
        reviewedAt: new Date(),
        rejectionReason: null,
        optoAppliedHours: approval.optoAppliedHours,
        payableOvertimeHours: approval.payableOvertimeHours,
      },
    });

    if (claimed.count !== 1) {
      throw new Error("This overtime entry was already reviewed.");
    }

    const updatedEmployee =
      approval.optoAppliedHours > 0
        ? await tx.employee.update({
            where: { id: before.employeeId },
            data: {
              optoBalanceHours: {
                decrement: approval.optoAppliedHours,
              },
            },
            select: {
              id: true,
              fullName: true,
              optoBalanceHours: true,
            },
          })
        : {
            id: before.employee.id,
            fullName: before.employee.fullName,
            optoBalanceHours: before.employee.optoBalanceHours,
          };
    const reviewed = await tx.overtimeRequest.findUniqueOrThrow({
      where: { id: before.id },
      include: { employee: true, reviewedBy: true },
    });

    if (approval.optoAppliedHours > 0) {
      const balanceAfter = Number(updatedEmployee.optoBalanceHours);
      const ledgerEntry = await tx.optoLedgerEntry.create({
        data: {
          employeeId: before.employeeId,
          adjustmentHours: -approval.optoAppliedHours,
          balanceBefore: balanceAfter + approval.optoAppliedHours,
          balanceAfter,
          adjustmentType: "DEBIT",
          effectiveDate: before.workDate,
          reason: `Applied to approved overtime entry for ${toIsoDate(before.workDate)}.`,
          createdByEmployeeId: input.actorEmployeeId ?? null,
          sourceEntityType: "OvertimeRequestApproval",
          sourceEntityId: before.id,
          metadata: {
            requestedHours: approval.requestedHours,
            optoAppliedHours: approval.optoAppliedHours,
          } satisfies Prisma.InputJsonObject,
        },
      });

      await writeAuditLog(
        {
          actorEmployeeId: input.actorEmployeeId,
          action: "opto.adjust_overtime",
          entityType: "OptoLedgerEntry",
          entityId: ledgerEntry.id,
          before: { balanceHours: balanceAfter + approval.optoAppliedHours },
          after: { balanceHours: balanceAfter },
          metadata: {
            overtimeRequestId: before.id,
            optoAppliedHours: approval.optoAppliedHours,
          },
        },
        tx,
      );
    }

    if (approval.payableOvertimeHours > 0) {
      await recordPayrollLedgerEntry(
        {
          employeeId: before.employeeId,
          type: "OVERTIME_PAYABLE",
          hours: approval.payableOvertimeHours,
          effectiveDate: toIsoDate(before.workDate),
          sourceEntityType: "OvertimeRequest",
          sourceEntityId: before.id,
          createdByEmployeeId: input.actorEmployeeId,
          metadata: {
            requestedHours: approval.requestedHours,
            optoAppliedHours: approval.optoAppliedHours,
            payableOvertimeHours: approval.payableOvertimeHours,
          },
          notes: "Approved payable overtime hours.",
        },
        tx,
      );
    }

    await writeAuditLog(
      {
        actorEmployeeId: input.actorEmployeeId,
        action: "overtime_entry.approve",
        entityType: "OvertimeRequest",
        entityId: reviewed.id,
        before,
        after: reviewed,
        metadata: {
          balanceReadHours: approval.optoBalanceHours,
          resultingBalanceHours: Number(updatedEmployee.optoBalanceHours),
          optoAppliedHours: approval.optoAppliedHours,
          payableOvertimeHours: approval.payableOvertimeHours,
        },
      },
      tx,
    );

    return reviewed;
  });
}

async function rejectOvertimeEntry(input: {
  requestId: string;
  rejectionReason?: string | null;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();

  return db.$transaction(async (tx) => {
    const before = await tx.overtimeRequest.findUniqueOrThrow({
      where: { id: input.requestId },
    });

    if (before.status !== "PENDING") {
      throw new Error("Only pending overtime entries can be rejected.");
    }

    const reviewed = await tx.overtimeRequest.update({
      where: { id: before.id },
      data: {
        status: "REJECTED",
        reviewedByEmployeeId: input.actorEmployeeId ?? null,
        reviewedAt: new Date(),
        rejectionReason: input.rejectionReason,
        optoAppliedHours: 0,
        payableOvertimeHours: 0,
      },
    });

    await writeAuditLog(
      {
        actorEmployeeId: input.actorEmployeeId,
        action: "overtime_entry.reject",
        entityType: "OvertimeRequest",
        entityId: reviewed.id,
        before,
        after: reviewed,
      },
      tx,
    );

    return reviewed;
  });
}

export async function reverseOvertimeApproval(input: {
  requestId: string;
  reason?: string | null;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();

  return db.$transaction(async (tx) => {
    const before = await tx.overtimeRequest.findUniqueOrThrow({
      where: { id: input.requestId },
      include: { employee: true },
    });

    if (before.status !== "APPROVED") {
      throw new Error("Only approved overtime entries can be reversed.");
    }

    const reversal = calculateOvertimeReversal({
      optoAppliedHours: Number(before.optoAppliedHours),
      payableOvertimeHours: Number(before.payableOvertimeHours),
    });
    const restoredOptoHours = reversal.restoredOptoHours;
    const removedPayableHours = Math.abs(reversal.payrollReversalHours);
    const reversed = await tx.overtimeRequest.update({
      where: { id: before.id },
      data: {
        status: "REVERSED",
        reviewedByEmployeeId: input.actorEmployeeId ?? null,
        reviewedAt: new Date(),
        rejectionReason: input.reason ?? before.rejectionReason,
      },
    });
    const updatedEmployee =
      restoredOptoHours > 0
        ? await tx.employee.update({
            where: { id: before.employeeId },
            data: {
              optoBalanceHours: {
                increment: restoredOptoHours,
              },
            },
            select: { optoBalanceHours: true },
          })
        : { optoBalanceHours: before.employee.optoBalanceHours };

    if (restoredOptoHours > 0) {
      const balanceAfter = Number(updatedEmployee.optoBalanceHours);
      const ledgerEntry = await tx.optoLedgerEntry.create({
        data: {
          employeeId: before.employeeId,
          adjustmentHours: restoredOptoHours,
          balanceBefore: balanceAfter - restoredOptoHours,
          balanceAfter,
          adjustmentType: "CREDIT",
          effectiveDate: before.workDate,
          reason: `Restored after overtime approval reversal for ${toIsoDate(before.workDate)}.`,
          createdByEmployeeId: input.actorEmployeeId ?? null,
          sourceEntityType: "OvertimeRequestReversal",
          sourceEntityId: before.id,
          metadata: {
            restoredOptoHours,
          } satisfies Prisma.InputJsonObject,
        },
      });

      await writeAuditLog(
        {
          actorEmployeeId: input.actorEmployeeId,
          action: "opto.restore_overtime_reversal",
          entityType: "OptoLedgerEntry",
          entityId: ledgerEntry.id,
          before: { balanceHours: balanceAfter - restoredOptoHours },
          after: { balanceHours: balanceAfter },
          metadata: { overtimeRequestId: before.id, restoredOptoHours },
        },
        tx,
      );
    }

    if (removedPayableHours > 0) {
      await recordPayrollLedgerEntry(
        {
          employeeId: before.employeeId,
          type: "REVERSAL_ADJUSTMENT",
          hours: reversal.payrollReversalHours,
          effectiveDate: toIsoDate(before.workDate),
          sourceEntityType: "OvertimeRequest",
          sourceEntityId: before.id,
          createdByEmployeeId: input.actorEmployeeId,
          metadata: {
            removedPayableOvertimeHours: removedPayableHours,
            previousStatus: before.status,
          },
          notes: "Overtime approval reversal removed payable overtime.",
        },
        tx,
      );
    }

    await writeAuditLog(
      {
        actorEmployeeId: input.actorEmployeeId,
        action: "overtime_entry.reverse",
        entityType: "OvertimeRequest",
        entityId: reversed.id,
        before,
        after: reversed,
        metadata: {
          restoredOptoHours,
          removedPayableOvertimeHours: removedPayableHours,
        },
      },
      tx,
    );

    return reversed;
  });
}

export async function cancelOwnOvertimeEntry(input: {
  requestId: string;
  employeeId: string;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();

  return db.$transaction(async (tx) => {
    const before = await tx.overtimeRequest.findUniqueOrThrow({
      where: { id: input.requestId },
    });

    if (before.employeeId !== input.employeeId) {
      throw new Error("Forbidden");
    }

    if (before.status !== "PENDING") {
      throw new Error("Only pending overtime entries can be cancelled.");
    }

    const cancelled = await tx.overtimeRequest.update({
      where: { id: before.id },
      data: { status: "CANCELLED" },
    });

    await writeAuditLog(
      {
        actorEmployeeId: input.actorEmployeeId,
        action: "overtime_entry.cancel",
        entityType: "OvertimeRequest",
        entityId: cancelled.id,
        before,
        after: cancelled,
      },
      tx,
    );

    return cancelled;
  });
}
