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
  clearGeneratedScheduleRange,
  generateScheduleRange,
  getScheduleRangeGenerationPreview,
  publishScheduleRange,
  unpublishScheduleRange,
} from "@/lib/db/schedule-workflows";
import { auditActorId, requireManager } from "@/lib/auth";
import {
  resolveScheduleRange,
  type ScheduleRangeMode,
} from "@/lib/schedule/range";
import type {
  MonthActionOperation,
  MonthActionState,
} from "@/lib/schedule/month";
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
    workPatternEmployees: String(summary.workPatternEmployees),
    workPatternRequiredExtraDays: String(summary.workPatternRequiredExtraDays),
    workPatternSatisfiedExtraDays: String(summary.workPatternSatisfiedExtraDays),
    missingExtraHourEmployees: String(summary.missingExtraHourEmployees),
    topOffSlots: String(summary.backgroundTopOffSlotsCreated),
    topOffAssignments: String(summary.backgroundTopOffAssignmentsCreated),
    roleMixSwaps: String(summary.backgroundRoleMixSwapsMade),
    patientRangeSwaps: String(summary.patientRangeSwapsMade),
    patientDiversitySwaps: String(summary.patientDiversitySwapsMade),
    patientRepairBlocked: String(summary.patientRepairBlockedEmployees),
    patientBelowMinimum: String(summary.patientBelowMinimum),
    patientAboveMaximum: String(summary.patientAboveMaximum),
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

export async function scheduleMonthAction(
  _previousState: MonthActionState,
  formData: FormData,
): Promise<MonthActionState> {
  const actor = await requireManager();
  const operation = monthActionOperation(formData.get("operation"));
  const date = getDateFromForm(formData);
  const range = resolveScheduleRange({ mode: "MONTH", date });

  try {
    if (operation === "GENERATE" || operation === "REGENERATE") {
      const preview = await getScheduleRangeGenerationPreview(range);
      const overwritePublished = formData.get("overwritePublished") === "on";

      if (
        operation === "GENERATE" &&
        preview.generatedDraftDates.length > 0
      ) {
        return {
          outcome: "blocked",
          operation,
          message:
            "This month already contains generated drafts. Use Regenerate month to confirm replacing generated output while preserving manual and locked overrides.",
          metrics: [
            {
              label: "Existing generated drafts",
              value: preview.generatedDraftDates.length,
            },
          ],
          issues: preview.generatedDraftDates,
          weekSummaries: [],
        };
      }

      if (
        overwritePublished &&
        formData.get("confirmPublishedOverwrite") !== "on"
      ) {
        return {
          outcome: "blocked",
          operation,
          message:
            "Confirm published overwrite before regenerating published days.",
          metrics: [
            {
              label: "Published days in month",
              value: preview.publishedDates.length,
            },
          ],
          issues: preview.publishedDates,
          weekSummaries: [],
        };
      }

      const summary = await generateScheduleRange({
        ...range,
        seedPrefix:
          operation === "REGENERATE"
            ? "clinic-month-regenerate"
            : "clinic-month",
        overwritePublished,
        actorEmployeeId: auditActorId(actor),
      });

      revalidateSchedulePaths();

      return {
        outcome:
          summary.hardRequirementIssues > 0 ||
          summary.requiredSlotsUnfilled > 0
            ? "blocked"
            : "success",
        operation,
        message:
          summary.hardRequirementIssues > 0 ||
          summary.requiredSlotsUnfilled > 0
            ? "Month generation finished, but review is required before publishing."
            : "Month generation finished successfully.",
        metrics: [
          { label: "Weeks processed", value: summary.weeksProcessed },
          {
            label: "Days processed",
            value:
              summary.datesProcessed + summary.publishedDatesSkipped.length,
          },
          { label: "Days created", value: summary.scheduleDaysCreated },
          { label: "Days regenerated", value: summary.datesRegenerated },
          {
            label: "Published days skipped",
            value: summary.publishedDatesSkipped.length,
          },
          { label: "Shift blocks", value: summary.shiftBlocks },
          { label: "Clinic slots", value: summary.clinicSlots },
          { label: "Background slots", value: summary.backgroundSlots },
          { label: "Assignments", value: summary.assignmentsFilled },
          {
            label: "Required unfilled",
            value: summary.requiredSlotsUnfilled,
          },
          {
            label: "Hard requirements",
            value: summary.hardRequirementIssues,
          },
          { label: "Under-target employees", value: summary.employeesUnderTarget },
          { label: "BG minimum issues", value: summary.bgMinimumIssues },
          { label: "Work-pattern issues", value: summary.workPatternIssues },
          { label: "Saturday issues", value: summary.saturdayIssues },
        ],
        issues: [
          ...summary.configurationWarnings,
          ...summary.datesNeedingManualReview.map(
            (reviewDate) => `${reviewDate} needs manager review.`,
          ),
        ],
        weekSummaries: summary.weekSummaries,
      };
    }

    if (operation === "PUBLISH") {
      const summary = await publishScheduleRange({
        ...range,
        actorEmployeeId: auditActorId(actor),
        overrideReason: String(formData.get("overrideReason") || "") || null,
      });

      revalidateSchedulePaths();

      return {
        outcome:
          summary.skippedDates.length > 0 ? "blocked" : "success",
        operation,
        message:
          summary.skippedDates.length > 0
            ? "Some or all days could not be published. Review the reasons below, or provide an override reason for hard requirements."
            : "All publishable days in the month are published.",
        metrics: [
          { label: "Published", value: summary.publishedDates.length },
          {
            label: "Already published",
            value: summary.alreadyPublishedDates.length,
          },
          { label: "Blocked", value: summary.skippedDates.length },
        ],
        issues: summary.skippedDates.map(
          (item) => `${item.date}: ${item.reason}`,
        ),
        weekSummaries: [],
      };
    }

    if (operation === "UNPUBLISH") {
      const summary = await unpublishScheduleRange({
        ...range,
        actorEmployeeId: auditActorId(actor),
      });

      revalidateSchedulePaths();

      return {
        outcome: "success",
        operation,
        message:
          "Published days were returned to draft status. Assignments were preserved.",
        metrics: [
          { label: "Unpublished", value: summary.unpublishedDates.length },
          {
            label: "Already draft",
            value: summary.skippedNotPublishedDates.length,
          },
        ],
        issues: [],
        weekSummaries: [],
      };
    }

    if (formData.get("confirmClear") !== "on") {
      return {
        outcome: "blocked",
        operation,
        message:
          "Confirm that generated assignments, generated slots, and safe empty generated shift blocks may be cleared.",
        metrics: [],
        issues: [],
        weekSummaries: [],
      };
    }

    const includePublished = formData.get("includePublished") === "on";

    if (
      includePublished &&
      formData.get("confirmClearPublished") !== "on"
    ) {
      return {
        outcome: "blocked",
        operation,
        message:
          "Confirm that published dates may be unpublished and cleared.",
        metrics: [],
        issues: [],
        weekSummaries: [],
      };
    }

    const summary = await clearGeneratedScheduleRange({
      ...range,
      includePublished,
      actorEmployeeId: auditActorId(actor),
    });

    revalidateSchedulePaths();

    return {
      outcome: "success",
      operation,
      message:
        "Generated month output was cleared. Manual and locked overrides were preserved.",
      metrics: [
        { label: "Days cleared", value: summary.datesCleared.length },
        {
          label: "Published days skipped",
          value: summary.publishedDatesSkipped.length,
        },
        {
          label: "Published days unpublished",
          value: summary.publishedDatesUnpublished.length,
        },
        { label: "Assignments removed", value: summary.assignmentsRemoved },
        { label: "Generated slots cancelled", value: summary.taskSlotsCancelled },
        {
          label: "Empty blocks deactivated",
          value: summary.shiftBlocksDeactivated,
        },
        { label: "Manual slots preserved", value: summary.manualSlotsPreserved },
        {
          label: "Locked assignments preserved",
          value: summary.lockedAssignmentsPreserved,
        },
      ],
      issues: summary.publishedDatesSkipped.map(
        (skippedDate) =>
          `${skippedDate} stayed published and was not cleared.`,
      ),
      weekSummaries: [],
    };
  } catch (error) {
    return {
      outcome: "error",
      operation,
      message:
        error instanceof Error ? error.message : "The month action failed.",
      metrics: [],
      issues: [],
      weekSummaries: [],
    };
  }
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

export async function clearGeneratedScheduleRangeAction(formData: FormData) {
  const actor = await requireManager();
  const date = getDateFromForm(formData);
  const range = resolveScheduleRange({
    mode: scheduleRangeMode(formData.get("mode")),
    date,
    customStartDate: String(formData.get("startDate") || "") || null,
    customEndDate: String(formData.get("endDate") || "") || null,
  });
  const includePublished = formData.get("includePublished") === "on";

  if (includePublished && formData.get("confirmClearPublished") !== "on") {
    throw new Error("Confirm that published dates may be unpublished and cleared.");
  }

  const summary = await clearGeneratedScheduleRange({
    ...range,
    includePublished,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/schedule");
  revalidatePath("/schedule/week");
  revalidatePath("/schedule/calendar");
  redirect(
    `/schedule/week?date=${range.startDate}&cleared=${summary.datesCleared.length}&clearSkipped=${summary.publishedDatesSkipped.length}&clearSlots=${summary.taskSlotsCancelled}&clearAssignments=${summary.assignmentsRemoved}`,
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

function monthActionOperation(
  value: FormDataEntryValue | null,
): MonthActionOperation {
  if (
    value === "GENERATE" ||
    value === "REGENERATE" ||
    value === "PUBLISH" ||
    value === "UNPUBLISH" ||
    value === "CLEAR"
  ) {
    return value;
  }

  throw new Error("Invalid month action.");
}

function revalidateSchedulePaths() {
  revalidatePath("/schedule");
  revalidatePath("/schedule/week");
  revalidatePath("/schedule/calendar");
}
