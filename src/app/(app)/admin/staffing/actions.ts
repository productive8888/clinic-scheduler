"use server";

import { revalidatePath } from "next/cache";
import { auditActorId, requireManager } from "@/lib/auth";
import {
  createStaffingRequirementRule,
  deactivateStaffingRequirementRule,
  updateStaffingRequirementRule,
} from "@/lib/db/staffing-requirements";
import { staffingRequirementValuesFromFormData } from "@/lib/validation/staffing-requirement";

export async function createStaffingRequirementRuleAction(formData: FormData) {
  const actor = await requireManager();
  const values = staffingRequirementValuesFromFormData(formData);

  await createStaffingRequirementRule({
    values,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/staffing");
  revalidatePath("/schedule");
}

export async function updateStaffingRequirementRuleAction(
  ruleId: string,
  formData: FormData,
) {
  const actor = await requireManager();
  const values = staffingRequirementValuesFromFormData(formData);

  await updateStaffingRequirementRule({
    ruleId,
    values,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/staffing");
  revalidatePath("/schedule");
}

export async function deactivateStaffingRequirementRuleAction(ruleId: string) {
  const actor = await requireManager();

  await deactivateStaffingRequirementRule({
    ruleId,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/staffing");
  revalidatePath("/schedule");
}
