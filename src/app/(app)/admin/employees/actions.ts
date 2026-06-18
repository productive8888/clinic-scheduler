"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditActorId, requireManager } from "@/lib/auth";
import { ensureAuthUserForEmployeeInTransaction } from "@/lib/auth/accounts";
import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { invalidateFutureEmployeeAssignments } from "@/lib/db/employee-schedule-invalidation";
import {
  employeeFormValuesFromFormData,
  type EmployeeFormValues,
} from "@/lib/validation/employee";
import { parseIsoDate } from "@/lib/utils/date";

export async function createEmployeeAction(formData: FormData) {
  const actor = await requireManager();
  const actorEmployeeId = auditActorId(actor);
  const values = employeeFormValuesFromFormData(formData);

  const employee = await getDb().$transaction(async (tx) => {
    const record = await tx.employee.create({
      data: {
        fullName: values.fullName,
        email: values.email,
        role: values.role,
        status: values.status,
        ptoBalanceHours: values.ptoBalanceHours,
        optoBalanceHours: values.optoBalanceHours,
        expectedWeeklyHours: values.expectedWeeklyHours,
        requiredWeeklyBackgroundShifts: values.requiredWeeklyBackgroundShifts,
        weeklyAssignmentLimit: values.weeklyAssignmentLimit,
        workPatternId: values.workPatternId,
        startDate: parseIsoDate(values.startDate),
        endDate: values.endDate ? parseIsoDate(values.endDate) : null,
        skills: {
          create: values.skillIds.map((skillId) => ({
            skillId,
          })),
        },
      },
    });

    await replaceEmployeeAvailability(tx, record.id, values);
    await ensureAuthUserForEmployeeInTransaction(tx, record.id);

    if (values.optoBalanceHours !== 0) {
      const ledgerEntry = await tx.optoLedgerEntry.create({
        data: {
          employeeId: record.id,
          adjustmentHours: values.optoBalanceHours,
          balanceBefore: 0,
          balanceAfter: values.optoBalanceHours,
          adjustmentType: "SET_BALANCE",
          effectiveDate: parseIsoDate(values.startDate),
          reason: "Initial OPTO balance set on employee profile.",
          createdByEmployeeId: actorEmployeeId,
          sourceEntityType: "EmployeeProfileCreate",
          sourceEntityId: record.id,
        },
      });

      await writeAuditLog(
        {
          actorEmployeeId,
          action: "opto.adjust_employee_profile",
          entityType: "OptoLedgerEntry",
          entityId: ledgerEntry.id,
          before: { balanceHours: 0 },
          after: { balanceHours: values.optoBalanceHours },
          metadata: { employeeId: record.id },
        },
        tx,
      );
    }

    return record;
  });

  await writeAuditLog({
    actorEmployeeId,
    action: "employee.create",
    entityType: "Employee",
    entityId: employee.id,
    after: values,
  });

  revalidatePath("/admin/employees");
}

export async function updateEmployeeAction(employeeId: string, formData: FormData) {
  const actor = await requireManager();
  const actorEmployeeId = auditActorId(actor);
  const values = employeeFormValuesFromFormData(formData);

  const before = await getDb().employee.findUnique({
    where: { id: employeeId },
    include: { skills: true, availability: true },
  });

  const employee = await getDb().$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw<
      Array<{ optoBalanceHours: { toString(): string } }>
    >`
      SELECT "optoBalanceHours"
      FROM "Employee"
      WHERE "id" = ${employeeId}
      FOR UPDATE
    `;
    const currentOptoBalance = Number(lockedRows[0]?.optoBalanceHours ?? 0);

    if (
      values.optoBalanceOriginal !== null &&
      currentOptoBalance !== values.optoBalanceOriginal
    ) {
      throw new Error(
        "OPTO balance changed while this employee form was open. Refresh and try again.",
      );
    }

    await tx.employeeSkill.deleteMany({ where: { employeeId } });
    await tx.weeklyAvailability.deleteMany({ where: { employeeId } });

    const record = await tx.employee.update({
      where: { id: employeeId },
      data: {
        fullName: values.fullName,
        email: values.email,
        role: values.role,
        status: values.status,
        ptoBalanceHours: values.ptoBalanceHours,
        optoBalanceHours: values.optoBalanceHours,
        expectedWeeklyHours: values.expectedWeeklyHours,
        requiredWeeklyBackgroundShifts: values.requiredWeeklyBackgroundShifts,
        weeklyAssignmentLimit: values.weeklyAssignmentLimit,
        workPatternId: values.workPatternId,
        startDate: parseIsoDate(values.startDate),
        endDate: values.endDate ? parseIsoDate(values.endDate) : null,
        skills: {
          create: values.skillIds.map((skillId) => ({
            skillId,
          })),
        },
      },
    });

    await replaceEmployeeAvailability(tx, employeeId, values);
    await ensureAuthUserForEmployeeInTransaction(tx, employeeId, {
      clearVerificationTokens: before?.email?.toLowerCase() !== values.email,
    });

    if (before?.email && before.email.toLowerCase() !== values.email) {
      await tx.verificationToken.deleteMany({
        where: {
          identifier: {
            in: [before.email.toLowerCase(), values.email],
          },
        },
      });
    }

    if (currentOptoBalance !== values.optoBalanceHours) {
      const ledgerEntry = await tx.optoLedgerEntry.create({
        data: {
          employeeId,
          adjustmentHours: values.optoBalanceHours - currentOptoBalance,
          balanceBefore: currentOptoBalance,
          balanceAfter: values.optoBalanceHours,
          adjustmentType: "SET_BALANCE",
          effectiveDate: new Date(),
          reason: "OPTO balance updated from employee profile.",
          createdByEmployeeId: actorEmployeeId,
          sourceEntityType: "EmployeeProfileUpdate",
          sourceEntityId: employeeId,
        },
      });

      await writeAuditLog(
        {
          actorEmployeeId,
          action: "opto.adjust_employee_profile",
          entityType: "OptoLedgerEntry",
          entityId: ledgerEntry.id,
          before: { balanceHours: currentOptoBalance },
          after: { balanceHours: values.optoBalanceHours },
          metadata: { employeeId },
        },
        tx,
      );
    }

    return record;
  });

  await writeAuditLog({
    actorEmployeeId,
    action: "employee.update",
    entityType: "Employee",
    entityId: employee.id,
    before,
    after: values,
  });

  revalidatePath("/admin/employees");
}

async function replaceEmployeeAvailability(
  tx: Prisma.TransactionClient,
  employeeId: string,
  values: EmployeeFormValues,
) {
  const availability = values.availability.filter((window) => window.active);

  if (availability.length === 0) {
    return;
  }

  await tx.weeklyAvailability.createMany({
    data: availability.map((window) => ({
      employeeId,
      weekday: window.weekday,
      startMinute: window.startMinute,
      endMinute: window.endMinute,
      effectiveStartDate: parseIsoDate(values.startDate),
    })),
  });
}

export async function deactivateEmployeeAction(employeeId: string) {
  const actor = await requireManager();
  const result = await getDb().$transaction(async (tx) => {
    const before = await tx.employee.findUniqueOrThrow({ where: { id: employeeId } });
    const invalidation = await invalidateFutureEmployeeAssignments(tx, {
      employeeId,
      employeeName: before.fullName,
      reason: "deactivated",
    });
    const employee = await tx.employee.update({
      where: { id: employeeId },
      data: { status: "INACTIVE" },
    });

    return { before, employee, ...invalidation };
  });

  await writeAuditLog({
    actorEmployeeId: auditActorId(actor),
    action: "employee.deactivate",
    entityType: "Employee",
    entityId: result.employee.id,
    before: result.before,
    after: {
      status: result.employee.status,
      affectedDates: result.affectedDates,
      affectedSlotCount: result.affectedSlotCount,
    },
  });

  revalidatePath("/admin/employees");
  revalidatePath("/schedule");
  revalidatePath("/schedule/week");
  revalidatePath("/admin/audit");
  redirect(invalidationNoticeUrl("deactivated", result.affectedDates));
}

export async function deleteEmployeeAction(employeeId: string) {
  const actor = await requireManager();
  const db = getDb();
  const deletedAt = new Date();
  const before = await db.employee.findUnique({
    where: { id: employeeId },
    include: {
      skills: true,
      availability: true,
    },
  });

  if (!before) {
    revalidatePath("/admin/employees");
    return;
  }

  const result = await db.$transaction(async (tx) => {
    const invalidation = await invalidateFutureEmployeeAssignments(tx, {
      employeeId,
      employeeName: before.fullName,
      reason: "deleted",
      invalidatedAt: deletedAt,
    });

    await tx.schedulingRule.updateMany({
      where: { employeeId },
      data: { active: false },
    });
    await tx.backgroundPullRule.updateMany({
      where: { employeeId },
      data: { active: false },
    });
    await tx.weeklyAvailability.updateMany({
      where: { employeeId, active: true },
      data: {
        active: false,
        effectiveEndDate: deletedAt,
      },
    });

    if (before.authProviderId) {
      await tx.session.deleteMany({ where: { userId: before.authProviderId } });
    }
    await tx.verificationToken.deleteMany({
      where: {
        identifier: {
          in: [before.email.toLowerCase()],
        },
      },
    });

    const employee = await tx.employee.update({
      where: { id: employeeId },
      data: {
        status: "DELETED",
        email: deletedEmployeeEmail(employeeId),
        authProviderId: null,
        endDate: before.endDate ?? deletedAt,
        notes: appendNote(
          before.notes,
          `Deleted ${deletedAt.toISOString()}. Previous email: ${before.email}.`,
        ),
      },
    });

    return {
      employee,
      ...invalidation,
    };
  });

  await writeAuditLog({
    actorEmployeeId: auditActorId(actor),
    action: "employee.delete",
    entityType: "Employee",
    entityId: result.employee.id,
    before,
    after: {
      status: result.employee.status,
      email: result.employee.email,
      affectedScheduleDayIds: result.affectedScheduleDayIds,
      affectedSlotCount: result.affectedSlotCount,
    },
  });

  revalidatePath("/admin/employees");
  revalidatePath("/schedule");
  revalidatePath("/schedule/week");
  revalidatePath("/admin/audit");
  redirect(invalidationNoticeUrl("deleted", result.affectedDates));
}

function deletedEmployeeEmail(employeeId: string) {
  return `deleted-${employeeId}@deleted.local`;
}

function appendNote(existing: string | null | undefined, next: string) {
  return [existing?.trim(), next].filter(Boolean).join("\n");
}

function invalidationNoticeUrl(action: string, affectedDates: string[]) {
  const params = new URLSearchParams({
    employeeAction: action,
    affectedCount: String(affectedDates.length),
  });

  if (affectedDates.length > 0) {
    params.set("affectedDates", affectedDates.slice(0, 12).join(","));
  }

  return `/admin/employees?${params.toString()}`;
}
