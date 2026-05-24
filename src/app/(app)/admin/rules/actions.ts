"use server";

import { revalidatePath } from "next/cache";
import { auditActorId, requireManager } from "@/lib/auth";
import {
  createSchedulingRule,
  deactivateSchedulingRule,
  updateSchedulingRule,
} from "@/lib/db/scheduling-rules";
import { schedulingRuleValuesFromFormData } from "@/lib/validation/scheduling-rule";

export async function createSchedulingRuleAction(formData: FormData) {
  const actor = await requireManager();
  const values = schedulingRuleValuesFromFormData(formData);

  await createSchedulingRule({
    values,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/rules");
  revalidatePath("/schedule");
}

export async function updateSchedulingRuleAction(
  ruleId: string,
  formData: FormData,
) {
  const actor = await requireManager();
  const values = schedulingRuleValuesFromFormData(formData);

  await updateSchedulingRule({
    ruleId,
    values,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/rules");
  revalidatePath("/schedule");
}

export async function deactivateSchedulingRuleAction(ruleId: string) {
  const actor = await requireManager();

  await deactivateSchedulingRule({
    ruleId,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/rules");
  revalidatePath("/schedule");
}
