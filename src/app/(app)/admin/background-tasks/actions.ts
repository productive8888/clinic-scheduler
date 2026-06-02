"use server";

import { revalidatePath } from "next/cache";
import { auditActorId, requireManager } from "@/lib/auth";
import {
  createBackgroundTaskCategory,
  createBackgroundTaskDefinition,
  deactivateBackgroundTaskDefinition,
  updateBackgroundTaskDefinition,
} from "@/lib/db/background-tasks";
import {
  backgroundTaskCategoryValuesFromFormData,
  backgroundTaskDefinitionValuesFromFormData,
} from "@/lib/validation/background-task";

export async function createBackgroundTaskCategoryAction(formData: FormData) {
  const actor = await requireManager();
  const values = backgroundTaskCategoryValuesFromFormData(formData);

  await createBackgroundTaskCategory({
    values,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/background-tasks");
}

export async function createBackgroundTaskDefinitionAction(formData: FormData) {
  const actor = await requireManager();
  const values = backgroundTaskDefinitionValuesFromFormData(formData);

  await createBackgroundTaskDefinition({
    values,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/background-tasks");
}

export async function updateBackgroundTaskDefinitionAction(
  definitionId: string,
  formData: FormData,
) {
  const actor = await requireManager();
  const values = backgroundTaskDefinitionValuesFromFormData(formData);

  await updateBackgroundTaskDefinition({
    definitionId,
    values,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/background-tasks");
}

export async function deactivateBackgroundTaskDefinitionAction(definitionId: string) {
  const actor = await requireManager();

  await deactivateBackgroundTaskDefinition({
    definitionId,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/background-tasks");
}
