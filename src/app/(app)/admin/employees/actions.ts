"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auditActorId, requireManager } from "@/lib/auth";
import { ensureAuthUserForEmployeeInTransaction } from "@/lib/auth/accounts";
import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import {
  employeeFormValuesFromFormData,
  type EmployeeFormValues,
} from "@/lib/validation/employee";
import { parseIsoDate } from "@/lib/utils/date";

export async function createEmployeeAction(formData: FormData) {
  const actor = await requireManager();
  const values = employeeFormValuesFromFormData(formData);

  const employee = await getDb().$transaction(async (tx) => {
    const record = await tx.employee.create({
      data: {
        fullName: values.fullName,
        email: values.email,
        role: values.role,
        status: values.status,
        ptoBalanceHours: values.ptoBalanceHours,
        expectedWeeklyHours: values.expectedWeeklyHours,
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

    return record;
  });

  await writeAuditLog({
    actorEmployeeId: auditActorId(actor),
    action: "employee.create",
    entityType: "Employee",
    entityId: employee.id,
    after: values,
  });

  revalidatePath("/admin/employees");
}

export async function updateEmployeeAction(employeeId: string, formData: FormData) {
  const actor = await requireManager();
  const values = employeeFormValuesFromFormData(formData);

  const before = await getDb().employee.findUnique({
    where: { id: employeeId },
    include: { skills: true, availability: true },
  });

  const employee = await getDb().$transaction(async (tx) => {
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
        expectedWeeklyHours: values.expectedWeeklyHours,
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
    await ensureAuthUserForEmployeeInTransaction(tx, employeeId);

    return record;
  });

  await writeAuditLog({
    actorEmployeeId: auditActorId(actor),
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
  const before = await getDb().employee.findUnique({ where: { id: employeeId } });
  const employee = await getDb().employee.update({
    where: { id: employeeId },
    data: { status: "INACTIVE" },
  });

  await writeAuditLog({
    actorEmployeeId: auditActorId(actor),
    action: "employee.deactivate",
    entityType: "Employee",
    entityId: employee.id,
    before,
    after: { status: employee.status },
  });

  revalidatePath("/admin/employees");
}

export async function deleteEmployeeAction(employeeId: string) {
  const actor = await requireManager();
  const db = getDb();
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

  const [
    assignmentCount,
    ptoRequestCount,
    reviewedPtoRequestCount,
    schedulingRuleCount,
    createdSchedulingRuleCount,
    generationRunCount,
    auditLogCount,
    exportLogCount,
    publishedScheduleCount,
  ] = await Promise.all([
    db.assignment.count({ where: { employeeId } }),
    db.pTORequest.count({ where: { employeeId } }),
    db.pTORequest.count({ where: { reviewedByEmployeeId: employeeId } }),
    db.schedulingRule.count({ where: { employeeId } }),
    db.schedulingRule.count({ where: { createdByEmployeeId: employeeId } }),
    db.scheduleGenerationRun.count({ where: { requestedByEmployeeId: employeeId } }),
    db.auditLog.count({ where: { actorEmployeeId: employeeId } }),
    db.exportLog.count({ where: { requestedByEmployeeId: employeeId } }),
    db.scheduleDay.count({ where: { publishedByEmployeeId: employeeId } }),
  ]);
  const relatedRecordCount =
    assignmentCount +
    ptoRequestCount +
    reviewedPtoRequestCount +
    schedulingRuleCount +
    createdSchedulingRuleCount +
    generationRunCount +
    auditLogCount +
    exportLogCount +
    publishedScheduleCount;

  if (relatedRecordCount > 0) {
    const employee = await db.employee.update({
      where: { id: employeeId },
      data: { status: "INACTIVE" },
    });

    await writeAuditLog({
      actorEmployeeId: auditActorId(actor),
      action: "employee.delete_requested_deactivated",
      entityType: "Employee",
      entityId: employee.id,
      before,
      after: {
        status: employee.status,
        relatedRecordCount,
      },
    });
  } else {
    await db.employee.delete({ where: { id: employeeId } });

    await writeAuditLog({
      actorEmployeeId: auditActorId(actor),
      action: "employee.delete",
      entityType: "Employee",
      entityId: employeeId,
      before,
      after: null,
    });
  }

  revalidatePath("/admin/employees");
}
