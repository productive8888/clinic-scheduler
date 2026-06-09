"use server";

import { ClinicScenario } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addTaskSlotToScheduleDay,
  copyScheduleDayAssignments,
  ensureScheduleDayWithDefaultSlots,
  manuallyAssignSlot,
  manuallyAssignSlots,
  publishScheduleForDate,
  setScheduleScenario,
  unpublishScheduleForDate,
} from "@/lib/db/schedule";
import {
  generateScheduleRange,
  publishScheduleRange,
  unpublishScheduleRange,
} from "@/lib/db/schedule-workflows";
import { auditActorId, requireManager } from "@/lib/auth";
import {
  resolveScheduleRange,
  type ScheduleRangeMode,
} from "@/lib/schedule/range";
import { todayIsoDate } from "@/lib/utils/date";

function getDateFromForm(formData: FormData) {
  return String(formData.get("date") || todayIsoDate()).slice(0, 10);
}

export async function createScheduleDayAction(formData: FormData) {
  const actor = await requireManager();
  const date = getDateFromForm(formData);

  await ensureScheduleDayWithDefaultSlots(date, auditActorId(actor));
  revalidatePath("/schedule");
  revalidatePath("/schedule/week");
  revalidatePath("/schedule/calendar");
}

export async function generateScheduleAction(formData: FormData) {
  const actor = await requireManager();
  const date = getDateFromForm(formData);
  const seed = String(formData.get("seed") || `clinic-${date}`);

  await generateScheduleRange({
    startDate: date,
    endDate: date,
    seedPrefix: seed,
    overwritePublished: formData.get("overwritePublished") === "on",
    actorEmployeeId: auditActorId(actor),
  });
  revalidatePath("/schedule");
  revalidatePath("/schedule/week");
  revalidatePath("/schedule/calendar");
}

export async function publishScheduleAction(formData: FormData) {
  const actor = await requireManager();
  const date = getDateFromForm(formData);

  await publishScheduleForDate({
    date,
    actorEmployeeId: auditActorId(actor),
    overrideReason: String(formData.get("overrideReason") || "") || null,
  });
  revalidatePath("/schedule");
  revalidatePath("/schedule/week");
  revalidatePath("/schedule/calendar");
}

export async function unpublishScheduleAction(formData: FormData) {
  const actor = await requireManager();
  const date = getDateFromForm(formData);

  await unpublishScheduleForDate({
    date,
    actorEmployeeId: auditActorId(actor),
  });
  revalidatePath("/schedule");
  revalidatePath("/schedule/week");
  revalidatePath("/schedule/calendar");
}

export async function manualAssignAction(slotId: string, formData: FormData) {
  const actor = await requireManager();
  const employeeId = String(formData.get("employeeId") || "");

  await manuallyAssignSlot({
    slotId,
    employeeId: employeeId || null,
    actorEmployeeId: auditActorId(actor),
    overrideReason: String(formData.get("overrideReason") || "") || null,
  });
  revalidatePath("/schedule");
  revalidatePath("/schedule/week");
  revalidatePath("/schedule/calendar");
}

export async function manualAssignMultipleAction(formData: FormData) {
  const actor = await requireManager();
  const slotIds = formData.getAll("slotIds").map(String).filter(Boolean);
  const employeeId = String(formData.get("employeeId") || "");

  if (!employeeId || slotIds.length === 0) {
    throw new Error("Select an employee and at least one shift slot.");
  }

  await manuallyAssignSlots({
    slotIds,
    employeeId,
    actorEmployeeId: auditActorId(actor),
    overrideReason: String(formData.get("overrideReason") || "") || null,
  });
  revalidatePath("/schedule");
  revalidatePath("/schedule/week");
  revalidatePath("/schedule/calendar");
}

export async function copyScheduleDayAssignmentsAction(formData: FormData) {
  const actor = await requireManager();
  const sourceDate = getDateFromForm(formData);
  const targetDate = String(formData.get("targetDate") || "").slice(0, 10);

  if (!targetDate) {
    throw new Error("Target date is required.");
  }

  await copyScheduleDayAssignments({
    sourceDate,
    targetDate,
    actorEmployeeId: auditActorId(actor),
    overrideReason: String(formData.get("overrideReason") || "") || null,
  });
  revalidatePath("/schedule");
  revalidatePath("/schedule/week");
  revalidatePath("/schedule/calendar");
}

export async function bulkGenerateScheduleAction(formData: FormData) {
  const actor = await requireManager();
  const date = getDateFromForm(formData);
  const mode = scheduleRangeMode(formData.get("mode"));
  const range = resolveScheduleRange({
    mode,
    date,
    customStartDate: String(formData.get("startDate") || "") || null,
    customEndDate: String(formData.get("endDate") || "") || null,
  });
  const summary = await generateScheduleRange({
    ...range,
    seedPrefix: String(formData.get("seedPrefix") || "clinic-bulk"),
    overwritePublished: formData.get("overwritePublished") === "on",
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/schedule");
  revalidatePath("/schedule/week");
  revalidatePath("/schedule/calendar");
  const params = new URLSearchParams({
    date: range.startDate,
    processed: String(summary.datesProcessed),
    daysCreated: String(summary.scheduleDaysCreated),
    daysRegenerated: String(summary.datesRegenerated),
    blocks: String(summary.shiftBlocks),
    amBlocks: String(summary.amShiftBlocks),
    pmBlocks: String(summary.pmShiftBlocks),
    saturdayBlocks: String(summary.saturdayShiftBlocks),
    amEarlyBlocks: String(summary.amEarlyShiftBlocks),
    amRegularBlocks: String(summary.amRegularShiftBlocks),
    pmRegularBlocks: String(summary.pmRegularShiftBlocks),
    mondayLongPmBlocks: String(summary.mondayLongPmShiftBlocks),
    saturdayEndoscopyBlocks: String(summary.saturdayEndoscopyShiftBlocks),
    saturdayRegularBlocks: String(summary.saturdayRegularShiftBlocks),
    slotsCreated: String(summary.taskSlotsCreated),
    clinicSlots: String(summary.clinicSlots),
    backgroundSlots: String(summary.backgroundSlots),
    workPatternSlots: String(summary.workPatternTopOffSlotsCreated),
    workPatternAssignments: String(summary.workPatternAssignmentsCreated),
    workPatternSwaps: String(summary.workPatternSwapsMade),
    workPatternUnresolved: String(summary.workPatternUnresolved),
    topOffSlots: String(summary.backgroundTopOffSlotsCreated),
    topOffAssignments: String(summary.backgroundTopOffAssignmentsCreated),
    topOffIncomplete: String(summary.backgroundTopOffIncompleteEmployees),
    filled: String(summary.assignmentsFilled),
    requiredUnfilled: String(summary.requiredSlotsUnfilled),
    shortages: String(summary.shortages),
    conflicts: String(summary.conflicts),
    underTarget: String(summary.employeesUnderTarget),
    overTarget: String(summary.employeesOverTarget),
    hardRequirements: String(summary.hardRequirementIssues),
    bgMinimum: String(summary.bgMinimumIssues),
    workPatterns: String(summary.workPatternIssues),
    review: String(summary.datesNeedingManualReview.length),
    publishedSkipped: String(summary.publishedDatesSkipped.length),
  });
  redirect(`/schedule/week?${params.toString()}`);
}

export async function publishScheduleRangeAction(formData: FormData) {
  const actor = await requireManager();
  const date = getDateFromForm(formData);
  const range = resolveScheduleRange({
    mode: scheduleRangeMode(formData.get("mode")),
    date,
    customStartDate: String(formData.get("startDate") || "") || null,
    customEndDate: String(formData.get("endDate") || "") || null,
  });
  const summary = await publishScheduleRange({
    ...range,
    actorEmployeeId: auditActorId(actor),
    overrideReason: String(formData.get("overrideReason") || "") || null,
  });

  revalidatePath("/schedule");
  revalidatePath("/schedule/week");
  revalidatePath("/schedule/calendar");
  redirect(
    `/schedule/week?date=${range.startDate}&published=${summary.publishedDates.length}&publishBlocked=${summary.skippedDates.length}`,
  );
}

export async function unpublishScheduleRangeAction(formData: FormData) {
  const actor = await requireManager();
  const date = getDateFromForm(formData);
  const range = resolveScheduleRange({
    mode: scheduleRangeMode(formData.get("mode")),
    date,
    customStartDate: String(formData.get("startDate") || "") || null,
    customEndDate: String(formData.get("endDate") || "") || null,
  });
  const summary = await unpublishScheduleRange({
    ...range,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/schedule");
  revalidatePath("/schedule/week");
  revalidatePath("/schedule/calendar");
  redirect(
    `/schedule/week?date=${range.startDate}&unpublished=${summary.unpublishedDates.length}&unpublishSkipped=${summary.skippedNotPublishedDates.length}`,
  );
}

export async function setScheduleScenarioAction(formData: FormData) {
  const actor = await requireManager();
  const date = getDateFromForm(formData);
  const scenario = String(formData.get("scenario") || "ROUTINE");

  if (!isClinicScenario(scenario)) {
    throw new Error("Invalid clinic scenario.");
  }

  await setScheduleScenario({
    date,
    scenario,
    actorEmployeeId: auditActorId(actor),
  });
  revalidatePath("/schedule");
  revalidatePath("/schedule/calendar");
}

export async function addTaskSlotAction(formData: FormData) {
  const actor = await requireManager();
  const date = getDateFromForm(formData);
  const taskTypeId = String(formData.get("taskTypeId") || "");
  const shiftBlockId = String(formData.get("shiftBlockId") || "");

  if (!taskTypeId) {
    throw new Error("Task type is required.");
  }

  await addTaskSlotToScheduleDay({
    date,
    taskTypeId,
    shiftBlockId: shiftBlockId || null,
    actorEmployeeId: auditActorId(actor),
  });
  revalidatePath("/schedule");
  revalidatePath("/schedule/week");
  revalidatePath("/schedule/calendar");
}

function isClinicScenario(value: string): value is ClinicScenario {
  return Object.values(ClinicScenario).includes(value as ClinicScenario);
}

function scheduleRangeMode(value: FormDataEntryValue | null): ScheduleRangeMode {
  return value === "WEEK" || value === "MONTH" || value === "CUSTOM"
    ? value
    : "DAY";
}
