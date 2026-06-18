import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { calculateOptoAdjustment } from "@/lib/opto/adjustment";
import type { OptoAdjustmentValues } from "@/lib/validation/opto";
import { parseIsoDate } from "@/lib/utils/date";

export async function getOptoAdminPageData(input: {
  employeeId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const where: Prisma.OptoLedgerEntryWhereInput = {
    ...(input.employeeId ? { employeeId: input.employeeId } : {}),
    ...(input.startDate || input.endDate
      ? {
          effectiveDate: {
            ...(input.startDate ? { gte: parseIsoDate(input.startDate) } : {}),
            ...(input.endDate ? { lte: parseIsoDate(input.endDate) } : {}),
          },
        }
      : {}),
  };

  const [employees, ledgerEntries] = await Promise.all([
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
    getDb().optoLedgerEntry.findMany({
      where,
      include: {
        employee: { select: { id: true, fullName: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: [
        { effectiveDate: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      take: 500,
    }),
  ]);

  return { employees, ledgerEntries };
}

export async function createOptoAdjustment(input: {
  values: OptoAdjustmentValues;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();

  return db.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw<Array<{ optoBalanceHours: Prisma.Decimal }>>`
      SELECT "optoBalanceHours"
      FROM "Employee"
      WHERE "id" = ${input.values.employeeId}
        AND "status" = 'ACTIVE'::"EmployeeStatus"
      FOR UPDATE
    `;
    const lockedEmployee = lockedRows[0];

    if (!lockedEmployee) {
      throw new Error("Active employee not found.");
    }

    const calculated = calculateOptoAdjustment({
      currentBalance: Number(lockedEmployee.optoBalanceHours),
      type: input.values.adjustmentType,
      hours: input.values.hours,
      allowNegative: true,
    });

    const employee = await tx.employee.update({
      where: { id: input.values.employeeId },
      data: { optoBalanceHours: calculated.balanceAfter },
      select: { id: true, fullName: true, optoBalanceHours: true },
    });
    const ledgerEntry = await tx.optoLedgerEntry.create({
      data: {
        employeeId: employee.id,
        adjustmentHours: calculated.adjustmentHours,
        balanceBefore: calculated.balanceBefore,
        balanceAfter: calculated.balanceAfter,
        adjustmentType: input.values.adjustmentType,
        effectiveDate: parseIsoDate(input.values.effectiveDate),
        reason: input.values.reason,
        createdByEmployeeId: input.actorEmployeeId ?? null,
      },
    });

    await writeAuditLog(
      {
        actorEmployeeId: input.actorEmployeeId,
        action: "opto.adjust",
        entityType: "OptoLedgerEntry",
        entityId: ledgerEntry.id,
        before: {
          employeeId: employee.id,
          balanceHours: calculated.balanceBefore,
        },
        after: {
          employeeId: employee.id,
          balanceHours: calculated.balanceAfter,
          adjustmentHours: calculated.adjustmentHours,
          adjustmentType: input.values.adjustmentType,
          effectiveDate: input.values.effectiveDate,
        },
        metadata: { reason: input.values.reason },
      },
      tx,
    );

    return { employee, ledgerEntry };
  });
}
