"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditActorId, requireManager } from "@/lib/auth";
import {
  createBackgroundTaskCategory,
  createBackgroundTaskDefinition,
  deactivateBackgroundTaskDefinition,
  deactivateBackgroundPullRule,
  updateBackgroundTaskDefinition,
  upsertBackgroundPullRule,
} from "@/lib/db/background-tasks";
import { generateBackgroundTaskSlotsForRange } from "@/lib/db/background-generation";
import { resolveScheduleRange } from "@/lib/schedule/range";
import { todayIsoDate } from "@/lib/utils/date";
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

export async function upsertBackgroundPullRuleAction(formData: FormData) {
  const actor = await requireManager();
  const employeeId = stringField(formData.get("employeeId"));

  if (!employeeId) {
    throw new Error("Employee is required for a pull-priority rule.");
  }

  await upsertBackgroundPullRule({
    actorEmployeeId: auditActorId(actor),
    values: {
      employeeId,
      priorityRank: numberField(formData.get("priorityRank"), 100),
      maxPullsPerPeriod: nullableNumberField(formData.get("maxPullsPerPeriod")),
      active: formData.get("active") === "on",
      notes: stringField(formData.get("notes")),
    },
  });

  revalidatePath("/admin/background-tasks");
  revalidatePath("/admin/audit");
}

export async function deactivateBackgroundPullRuleAction(ruleId: string) {
  const actor = await requireManager();

  await deactivateBackgroundPullRule({
    ruleId,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/background-tasks");
  revalidatePath("/admin/audit");
}

export async function generateBackgroundTaskSlotsAction(formData: FormData) {
  const actor = await requireManager();
  const date = String(formData.get("date") || todayIsoDate()).slice(0, 10);
  const mode = formData.get("mode") === "CUSTOM" ? "CUSTOM" : "WEEK";
  const range = resolveScheduleRange({
    mode,
    date,
    customStartDate: stringField(formData.get("startDate")),
    customEndDate: stringField(formData.get("endDate")),
  });
  const summary = await generateBackgroundTaskSlotsForRange({
    ...range,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/background-tasks");
  revalidatePath("/schedule");
  revalidatePath("/schedule/week");
  redirect(
    `/admin/background-tasks?generated=${summary.slotsCreated}&instances=${summary.instanceCount}`,
  );
}

function stringField(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberField(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumberField(value: FormDataEntryValue | null) {
  if (value === null || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}
