"use server";

import { revalidatePath } from "next/cache";
import { auditActorId, requireActor } from "@/lib/auth";
import { cancelOwnNptoRequest, createNptoRequest } from "@/lib/db/npto";
import {
  cancelOwnOvertimeEntry,
  createOvertimeEntry,
} from "@/lib/db/overtime";
import { cancelOwnPtoRequest, createPtoRequest } from "@/lib/db/pto";
import { nptoRequestValuesFromFormData } from "@/lib/validation/npto";
import { overtimeEntryValuesFromFormData } from "@/lib/validation/overtime";
import { ptoRequestValuesFromFormData } from "@/lib/validation/pto";

export async function createMyPtoRequestAction(formData: FormData) {
  const actor = await requireActor();

  if (actor.isDevFallback) {
    revalidatePath("/employee");
    return;
  }

  const values = ptoRequestValuesFromFormData(formData);

  await createPtoRequest({
    values,
    employeeId: actor.id,
    actorEmployeeId: auditActorId(actor),
    action: "pto_request.self_create",
  });

  revalidatePath("/employee");
  revalidatePath("/admin/pto");
}

export async function cancelMyPtoRequestAction(requestId: string) {
  const actor = await requireActor();

  if (actor.isDevFallback) {
    throw new Error("Self-service PTO requires a linked employee profile.");
  }

  await cancelOwnPtoRequest({
    requestId,
    employeeId: actor.id,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/employee");
  revalidatePath("/admin/pto");
}

export async function createMyNptoRequestAction(formData: FormData) {
  const actor = await requireActor();

  if (actor.isDevFallback) {
    revalidatePath("/employee");
    return;
  }

  const values = nptoRequestValuesFromFormData(formData);

  await createNptoRequest({
    values,
    employeeId: actor.id,
    actorEmployeeId: auditActorId(actor),
    action: "npto_request.self_create",
  });

  revalidatePath("/employee");
  revalidatePath("/admin/pto");
}

export async function cancelMyNptoRequestAction(requestId: string) {
  const actor = await requireActor();

  if (actor.isDevFallback) {
    throw new Error("Self-service NPTO requires a linked employee profile.");
  }

  await cancelOwnNptoRequest({
    requestId,
    employeeId: actor.id,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/employee");
  revalidatePath("/admin/pto");
}

export async function createMyOvertimeEntryAction(formData: FormData) {
  const actor = await requireActor();

  if (actor.isDevFallback) {
    revalidatePath("/employee");
    return;
  }

  const values = overtimeEntryValuesFromFormData(formData);

  await createOvertimeEntry({
    employeeId: actor.id,
    values: { ...values, employeeId: null },
    actorEmployeeId: auditActorId(actor),
    action: "overtime_entry.self_create",
  });

  revalidatePath("/employee");
  revalidatePath("/admin/overtime");
}

export async function cancelMyOvertimeEntryAction(requestId: string) {
  const actor = await requireActor();

  if (actor.isDevFallback) {
    throw new Error("Self-service overtime logging requires a linked employee profile.");
  }

  await cancelOwnOvertimeEntry({
    requestId,
    employeeId: actor.id,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/employee");
  revalidatePath("/admin/overtime");
}
