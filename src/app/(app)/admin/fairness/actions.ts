"use server";

import { revalidatePath } from "next/cache";
import { auditActorId, requireManager } from "@/lib/auth";
import { updateFairnessSettings } from "@/lib/db/fairness-settings";
import { fairnessSettingValuesFromFormData } from "@/lib/validation/fairness-setting";

export async function updateFairnessSettingsAction(formData: FormData) {
  const actor = await requireManager();
  const values = fairnessSettingValuesFromFormData(formData);

  await updateFairnessSettings({
    values,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/fairness");
  revalidatePath("/schedule");
}
