"use server";

import { revalidatePath } from "next/cache";
import {
  ensureScheduleDayWithDefaultSlots,
  generateScheduleForDate,
  manuallyAssignSlot,
  publishScheduleForDate,
} from "@/lib/db/schedule";
import { auditActorId, requireManager } from "@/lib/auth";
import { todayIsoDate } from "@/lib/utils/date";

function getDateFromForm(formData: FormData) {
  return String(formData.get("date") || todayIsoDate()).slice(0, 10);
}

export async function createScheduleDayAction(formData: FormData) {
  const actor = await requireManager();
  const date = getDateFromForm(formData);

  await ensureScheduleDayWithDefaultSlots(date, auditActorId(actor));
  revalidatePath("/schedule");
}

export async function generateScheduleAction(formData: FormData) {
  const actor = await requireManager();
  const date = getDateFromForm(formData);
  const seed = String(formData.get("seed") || `clinic-${date}`);

  await generateScheduleForDate({
    date,
    seed,
    actorEmployeeId: auditActorId(actor),
  });
  revalidatePath("/schedule");
}

export async function publishScheduleAction(formData: FormData) {
  const actor = await requireManager();
  const date = getDateFromForm(formData);

  await publishScheduleForDate({
    date,
    actorEmployeeId: auditActorId(actor),
  });
  revalidatePath("/schedule");
}

export async function manualAssignAction(slotId: string, formData: FormData) {
  const actor = await requireManager();
  const employeeId = String(formData.get("employeeId") || "");

  await manuallyAssignSlot({
    slotId,
    employeeId: employeeId || null,
    actorEmployeeId: auditActorId(actor),
  });
  revalidatePath("/schedule");
}
