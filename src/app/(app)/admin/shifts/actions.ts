"use server";

import { revalidatePath } from "next/cache";
import { auditActorId, requireManager } from "@/lib/auth";
import {
  createShiftTemplate,
  deactivateShiftTemplate,
  updateShiftTemplate,
} from "@/lib/db/shift-templates";
import { shiftTemplateValuesFromFormData } from "@/lib/validation/shift-template";

export async function createShiftTemplateAction(formData: FormData) {
  const actor = await requireManager();
  const values = shiftTemplateValuesFromFormData(formData);

  await createShiftTemplate({
    values,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/shifts");
  revalidatePath("/schedule");
}

export async function updateShiftTemplateAction(
  templateId: string,
  formData: FormData,
) {
  const actor = await requireManager();
  const values = shiftTemplateValuesFromFormData(formData);

  await updateShiftTemplate({
    templateId,
    values,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/shifts");
  revalidatePath("/schedule");
}

export async function deactivateShiftTemplateAction(templateId: string) {
  const actor = await requireManager();

  await deactivateShiftTemplate({
    templateId,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/shifts");
  revalidatePath("/schedule");
}
