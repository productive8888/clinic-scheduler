"use server";

import { revalidatePath } from "next/cache";
import { auditActorId, requireManager } from "@/lib/auth";
import {
  createOvertimeEntry,
  reverseOvertimeApproval,
  reviewOvertimeEntry,
} from "@/lib/db/overtime";
import {
  overtimeEntryValuesFromFormData,
  overtimeReviewValuesFromFormData,
} from "@/lib/validation/overtime";

export async function createOvertimeEntryForEmployeeAction(formData: FormData) {
  const actor = await requireManager();
  const values = overtimeEntryValuesFromFormData(formData);

  if (!values.employeeId) {
    throw new Error("Employee is required.");
  }

  await createOvertimeEntry({
    employeeId: values.employeeId,
    values,
    actorEmployeeId: auditActorId(actor),
    action: "overtime_entry.manager_create",
  });

  revalidateOvertimePaths();
}

export async function approveOvertimeEntryAction(requestId: string) {
  const actor = await requireManager();

  await reviewOvertimeEntry({
    requestId,
    status: "APPROVED",
    actorEmployeeId: auditActorId(actor),
  });

  revalidateOvertimePaths();
}

export async function rejectOvertimeEntryAction(
  requestId: string,
  formData: FormData,
) {
  const actor = await requireManager();
  const values = overtimeReviewValuesFromFormData(formData);

  await reviewOvertimeEntry({
    requestId,
    status: "REJECTED",
    rejectionReason: values.rejectionReason,
    actorEmployeeId: auditActorId(actor),
  });

  revalidateOvertimePaths();
}

export async function reverseOvertimeApprovalAction(
  requestId: string,
  formData: FormData,
) {
  const actor = await requireManager();
  const values = overtimeReviewValuesFromFormData(formData);

  if (!values.rejectionReason) {
    throw new Error("A reversal reason is required.");
  }

  await reverseOvertimeApproval({
    requestId,
    reason: values.rejectionReason,
    actorEmployeeId: auditActorId(actor),
  });

  revalidateOvertimePaths();
}

function revalidateOvertimePaths() {
  revalidatePath("/admin/overtime");
  revalidatePath("/admin/opto");
  revalidatePath("/admin/payroll");
  revalidatePath("/admin/audit");
  revalidatePath("/admin/employees");
  revalidatePath("/employee");
}
