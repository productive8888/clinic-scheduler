"use server";

import { revalidatePath } from "next/cache";
import { auditActorId, requireActor } from "@/lib/auth";
import { cancelOwnPtoRequest, createPtoRequest } from "@/lib/db/pto";
import { ptoRequestValuesFromFormData } from "@/lib/validation/pto";

export async function createMyPtoRequestAction(formData: FormData) {
  const actor = await requireActor();

  if (actor.isDevFallback) {
    throw new Error("Self-service PTO requires a linked employee profile.");
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
