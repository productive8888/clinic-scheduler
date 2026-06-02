"use server";

import { revalidatePath } from "next/cache";
import { auditActorId, requireManager } from "@/lib/auth";
import {
  createShortageRule,
  deactivateShortageRule,
  updateShortageRule,
} from "@/lib/db/shortage-rules";
import { shortageRuleValuesFromFormData } from "@/lib/validation/shortage-rule";

export async function createShortageRuleAction(formData: FormData) {
  const actor = await requireManager();
  const values = shortageRuleValuesFromFormData(formData);

  await createShortageRule({
    values,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/shortages");
  revalidatePath("/schedule");
}

export async function updateShortageRuleAction(
  ruleId: string,
  formData: FormData,
) {
  const actor = await requireManager();
  const values = shortageRuleValuesFromFormData(formData);

  await updateShortageRule({
    ruleId,
    values,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/shortages");
  revalidatePath("/schedule");
}

export async function deactivateShortageRuleAction(ruleId: string) {
  const actor = await requireManager();

  await deactivateShortageRule({
    ruleId,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/shortages");
  revalidatePath("/schedule");
}
