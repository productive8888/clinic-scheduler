"use server";

import { AssignmentStatus, TaskSlotStatus, type Prisma } from "@prisma/client";
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
    const activeAssignedSlots = await tx.taskSlot.findMany({
      where: {
        assignments: {
          some: {
            employeeId,
            status: AssignmentStatus.ACTIVE,
          },
        },
        status: { not: TaskSlotStatus.CANCELLED },
      },
      select: {
        id: true,
        requiredStaff: true,
        requirementLevel: true,
        scheduleDay: {
          select: {
            id: true,
            date: true,
            status: true,
            notes: true,
          },
        },
        assignments: {
          where: {
            status: AssignmentStatus.ACTIVE,
            employeeId: { not: employeeId },
          },
          select: { id: true },
        },
      },
    });
    const affectedScheduleDays = new Map(
      activeAssignedSlots.map((slot) => [slot.scheduleDay.id, slot.scheduleDay]),
    );

    await tx.assignment.updateMany({
      where: {
        employeeId,
        status: AssignmentStatus.ACTIVE,
      },
      data: {
        status: AssignmentStatus.REMOVED,
        removedAt: deletedAt,
        notes: "Removed because the employee was deleted.",
      },
    });

    for (const slot of activeAssignedSlots) {
      const remainingAssignments = slot.assignments.length;
      const status =
        remainingAssignments > 0
          ? TaskSlotStatus.FILLED
          : slot.requiredStaff > 0 && slot.requirementLevel === "REQUIRED"
            ? TaskSlotStatus.SHORTAGE
            : TaskSlotStatus.OPEN;

      await tx.taskSlot.update({
        where: { id: slot.id },
        data: {
          status,
          notes:
            status === TaskSlotStatus.SHORTAGE
              ? "Employee was deleted; regenerate or manually assign coverage."
              : null,
        },
      });
    }

    for (const scheduleDay of affectedScheduleDays.values()) {
      await tx.scheduleDay.update({
        where: { id: scheduleDay.id },
        data: {
          status: "GENERATED",
          publishedAt: null,
          publishedByEmployeeId: null,
          notes: appendNote(
            scheduleDay.notes,
            `Invalidated ${deletedAt.toISOString()} because ${before.fullName} was deleted.`,
          ),
        },
      });
    }

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
      affectedScheduleDayIds: [...affectedScheduleDays.keys()],
      affectedSlotCount: activeAssignedSlots.length,
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
  revalidatePath("/admin/audit");
}

function deletedEmployeeEmail(employeeId: string) {
  return `deleted-${employeeId}@deleted.local`;
}

function appendNote(existing: string | null | undefined, next: string) {
  return [existing?.trim(), next].filter(Boolean).join("\n");
}
