"use server";

import { revalidatePath } from "next/cache";
import { auditActorId, requireManager } from "@/lib/auth";
import {
  applyEastonDefaultsFromWorkbook,
  saveEastonImportReview,
} from "@/lib/db/easton-import";

export async function saveEastonImportReviewAction() {
  const actor = await requireManager();

  await saveEastonImportReview({
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/easton-import");
  revalidatePath("/admin/audit");
}

export async function applyEastonDefaultsAction() {
  const actor = await requireManager();

  await applyEastonDefaultsFromWorkbook({
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/easton-import");
  revalidatePath("/admin/shifts");
  revalidatePath("/admin/staffing");
  revalidatePath("/admin/shortages");
  revalidatePath("/admin/fairness");
  revalidatePath("/admin/background-tasks");
  revalidatePath("/admin/payroll");
  revalidatePath("/schedule");
  revalidatePath("/admin/audit");
}
