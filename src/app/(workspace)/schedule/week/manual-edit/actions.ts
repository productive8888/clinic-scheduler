"use server";

import { revalidatePath } from "next/cache";
import { auditActorId, requireManager } from "@/lib/auth";
import {
  getManualEditCandidates,
  previewManualEditBatch,
  saveManualEditBatch,
} from "@/lib/db/manual-edit";
import { manualEditBatchFromJson } from "@/lib/validation/manual-edit";

export async function previewManualEditAction(payload: string) {
  await requireManager();
  return previewManualEditBatch(manualEditBatchFromJson(payload));
}

export async function getManualEditCandidatesAction(input: {
  payload: string;
  assignmentId?: string | null;
  slotId?: string | null;
}) {
  await requireManager();

  return getManualEditCandidates({
    batch: manualEditBatchFromJson(input.payload),
    assignmentId: input.assignmentId,
    slotId: input.slotId,
  });
}

export async function saveManualEditAction(payload: string) {
  const actor = await requireManager();
  const result = await saveManualEditBatch({
    batch: manualEditBatchFromJson(payload),
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/schedule");
  revalidatePath("/schedule/week");
  revalidatePath("/schedule/calendar");
  revalidatePath("/admin/payroll");
  revalidatePath("/admin/audit");

  return result;
}
