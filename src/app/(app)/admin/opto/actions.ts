"use server";

import { revalidatePath } from "next/cache";
import { auditActorId, requireManager } from "@/lib/auth";
import { createOptoAdjustment } from "@/lib/db/opto";
import { optoAdjustmentValuesFromFormData } from "@/lib/validation/opto";

export async function createOptoAdjustmentAction(formData: FormData) {
  const actor = await requireManager();
  const values = optoAdjustmentValuesFromFormData(formData);

  await createOptoAdjustment({
    values,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/opto");
  revalidatePath("/admin/audit");
}
