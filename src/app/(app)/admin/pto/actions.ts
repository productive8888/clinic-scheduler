"use server";

import { revalidatePath } from "next/cache";
import { auditActorId, requireManager } from "@/lib/auth";
import {
  cancelNptoRequestAsAdmin,
  createNptoRequest,
  overrideNptoRequest,
  returnNptoRequestToPending,
  reverseNptoApproval,
  reviewNptoRequest,
  updateNptoCap,
} from "@/lib/db/npto";
import {
  cancelPtoRequestAsAdmin,
  createPtoRequest,
  overridePtoRequest,
  returnPtoRequestToPending,
  reversePtoApproval,
  reviewPtoRequest,
} from "@/lib/db/pto";
import {
  nptoRequestValuesFromFormData,
  nptoReviewValuesFromFormData,
  nptoSettingsValuesFromFormData,
} from "@/lib/validation/npto";
import {
  ptoRequestValuesFromFormData,
  ptoReviewValuesFromFormData,
} from "@/lib/validation/pto";

export async function createPtoForEmployeeAction(formData: FormData) {
  const actor = await requireManager();
  const values = ptoRequestValuesFromFormData(formData);

  if (!values.employeeId) {
    throw new Error("Employee is required.");
  }

  await createPtoRequest({
    values,
    employeeId: values.employeeId,
    actorEmployeeId: auditActorId(actor),
    action: "pto_request.admin_create",
  });

  revalidatePath("/admin/pto");
  revalidatePath("/employee");
}

export async function approvePtoRequestAction(
  requestId: string,
  formData: FormData,
) {
  const actor = await requireManager();
  const values = ptoReviewValuesFromFormData(formData, "APPROVED");

  await reviewPtoRequest({
    requestId,
    status: values.status,
    managerNote: values.managerNote,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/pto");
  revalidatePath("/employee");
  revalidatePath("/schedule");
}

export async function rejectPtoRequestAction(
  requestId: string,
  formData: FormData,
) {
  const actor = await requireManager();
  const values = ptoReviewValuesFromFormData(formData, "REJECTED");

  await reviewPtoRequest({
    requestId,
    status: values.status,
    managerNote: values.managerNote,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/pto");
  revalidatePath("/employee");
}

export async function overridePtoRequestAction(
  requestId: string,
  formData: FormData,
) {
  const actor = await requireManager();

  await overridePtoRequest({
    requestId,
    managerNote: formData.get("managerNote")?.toString() || null,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/pto");
  revalidatePath("/employee");
  revalidatePath("/schedule");
}

export async function reversePtoApprovalAction(
  requestId: string,
  formData: FormData,
) {
  const actor = await requireManager();

  await reversePtoApproval({
    requestId,
    managerNote: formData.get("managerNote")?.toString() || null,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/pto");
  revalidatePath("/employee");
  revalidatePath("/schedule");
}

export async function returnPtoToPendingAction(
  requestId: string,
  formData: FormData,
) {
  const actor = await requireManager();

  await returnPtoRequestToPending({
    requestId,
    managerNote: formData.get("managerNote")?.toString() || null,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/pto");
  revalidatePath("/employee");
}

export async function cancelPtoAsAdminAction(
  requestId: string,
  formData: FormData,
) {
  const actor = await requireManager();

  await cancelPtoRequestAsAdmin({
    requestId,
    managerNote: formData.get("managerNote")?.toString() || null,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/pto");
  revalidatePath("/employee");
}

export async function createNptoForEmployeeAction(formData: FormData) {
  const actor = await requireManager();
  const values = nptoRequestValuesFromFormData(formData);

  if (!values.employeeId) {
    throw new Error("Employee is required.");
  }

  await createNptoRequest({
    values,
    employeeId: values.employeeId,
    actorEmployeeId: auditActorId(actor),
    action: "npto_request.admin_create",
  });

  revalidatePath("/admin/pto");
  revalidatePath("/employee");
}

export async function approveNptoRequestAction(
  requestId: string,
  formData: FormData,
) {
  const actor = await requireManager();
  const values = nptoReviewValuesFromFormData(formData, "APPROVED");

  await reviewNptoRequest({
    requestId,
    status: values.status,
    managerNote: values.managerNote,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/pto");
  revalidatePath("/employee");
  revalidatePath("/schedule");
}

export async function rejectNptoRequestAction(
  requestId: string,
  formData: FormData,
) {
  const actor = await requireManager();
  const values = nptoReviewValuesFromFormData(formData, "REJECTED");

  await reviewNptoRequest({
    requestId,
    status: values.status,
    managerNote: values.managerNote,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/pto");
  revalidatePath("/employee");
}

export async function overrideNptoRequestAction(
  requestId: string,
  formData: FormData,
) {
  const actor = await requireManager();

  await overrideNptoRequest({
    requestId,
    managerNote: formData.get("managerNote")?.toString() || null,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/pto");
  revalidatePath("/employee");
  revalidatePath("/schedule");
}

export async function reverseNptoApprovalAction(
  requestId: string,
  formData: FormData,
) {
  const actor = await requireManager();

  await reverseNptoApproval({
    requestId,
    managerNote: formData.get("managerNote")?.toString() || null,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/pto");
  revalidatePath("/employee");
  revalidatePath("/schedule");
}

export async function returnNptoToPendingAction(
  requestId: string,
  formData: FormData,
) {
  const actor = await requireManager();

  await returnNptoRequestToPending({
    requestId,
    managerNote: formData.get("managerNote")?.toString() || null,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/pto");
  revalidatePath("/employee");
}

export async function cancelNptoAsAdminAction(
  requestId: string,
  formData: FormData,
) {
  const actor = await requireManager();

  await cancelNptoRequestAsAdmin({
    requestId,
    managerNote: formData.get("managerNote")?.toString() || null,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/pto");
  revalidatePath("/employee");
}

export async function updateNptoCapAction(formData: FormData) {
  const actor = await requireManager();
  const values = nptoSettingsValuesFromFormData(formData);

  await updateNptoCap({
    nptoCapHours: values.nptoCapHours,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/pto");
}
