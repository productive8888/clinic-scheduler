"use server";

import { revalidatePath } from "next/cache";
import { auditActorId, requireManager } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { employeeFormValuesFromFormData } from "@/lib/validation/employee";
import { parseIsoDate } from "@/lib/utils/date";

const defaultWeekdays = [1, 2, 3, 4, 5];

export async function createEmployeeAction(formData: FormData) {
  const actor = await requireManager();
  const values = employeeFormValuesFromFormData(formData);

  const employee = await getDb().employee.create({
    data: {
      fullName: values.fullName,
      email: values.email,
      authProviderId: values.authProviderId,
      role: values.role,
      status: values.status,
      ptoBalanceHours: values.ptoBalanceHours,
      weeklyAssignmentLimit: values.weeklyAssignmentLimit,
      startDate: parseIsoDate(values.startDate),
      endDate: values.endDate ? parseIsoDate(values.endDate) : null,
      skills: {
        create: values.skillIds.map((skillId) => ({
          skillId,
        })),
      },
      availability: values.createDefaultAvailability
        ? {
            create: defaultWeekdays.map((weekday) => ({
              weekday,
              startMinute: 8 * 60,
              endMinute: 17 * 60,
              effectiveStartDate: parseIsoDate(values.startDate),
            })),
          }
        : undefined,
    },
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
    include: { skills: true },
  });

  const employee = await getDb().$transaction(async (tx) => {
    await tx.employeeSkill.deleteMany({ where: { employeeId } });

    return tx.employee.update({
      where: { id: employeeId },
      data: {
        fullName: values.fullName,
        email: values.email,
        authProviderId: values.authProviderId,
        role: values.role,
        status: values.status,
        ptoBalanceHours: values.ptoBalanceHours,
        weeklyAssignmentLimit: values.weeklyAssignmentLimit,
        startDate: parseIsoDate(values.startDate),
        endDate: values.endDate ? parseIsoDate(values.endDate) : null,
        skills: {
          create: values.skillIds.map((skillId) => ({
            skillId,
          })),
        },
      },
    });
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
