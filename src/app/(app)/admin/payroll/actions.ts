"use server";

import { EndoscopyCompPolicy, HolidayPayRule } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auditActorId, requireManager } from "@/lib/auth";
import {
  createPaidHoliday,
  deactivatePaidHoliday,
  updatePayrollSettings,
} from "@/lib/db/payroll";

export async function updatePayrollSettingsAction(formData: FormData) {
  const actor = await requireManager();

  await updatePayrollSettings({
    actorEmployeeId: auditActorId(actor),
    values: {
      defaultPayrollPeriodDays: numberField(
        formData.get("defaultPayrollPeriodDays"),
        14,
      ),
      fullTimeWeeklyHours: numberField(formData.get("fullTimeWeeklyHours"), 40),
      paidHolidayDefaultHours: numberField(
        formData.get("paidHolidayDefaultHours"),
        8,
      ),
      compTimeBankingEnabled: formData.get("compTimeBankingEnabled") === "on",
      bankOverExpectedHours: formData.get("bankOverExpectedHours") === "on",
      deductUnderExpectedHours:
        formData.get("deductUnderExpectedHours") === "on",
      flagUnderExpectedHours: formData.get("flagUnderExpectedHours") === "on",
      endoscopyExtraHoursPolicy: endoscopyCompPolicyField(
        formData.get("endoscopyExtraHoursPolicy"),
      ),
      endoscopyShortenShiftSuggestions:
        formData.get("endoscopyShortenShiftSuggestions") === "on",
    },
  });

  revalidatePath("/admin/payroll");
}

export async function createPaidHolidayAction(formData: FormData) {
  const actor = await requireManager();
  const date = stringField(formData.get("date"));
  const name = stringField(formData.get("name"));
  const rule = stringField(formData.get("rule")) as HolidayPayRule;

  if (!date || !name || !Object.values(HolidayPayRule).includes(rule)) {
    throw new Error("Paid holiday date, name, and rule are required.");
  }

  await createPaidHoliday({
    date,
    name,
    hours: numberField(formData.get("hours"), 8),
    rule,
    notes: stringField(formData.get("notes")),
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/payroll");
}

export async function deactivatePaidHolidayAction(holidayId: string) {
  const actor = await requireManager();

  await deactivatePaidHoliday({
    holidayId,
    actorEmployeeId: auditActorId(actor),
  });

  revalidatePath("/admin/payroll");
}

function stringField(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberField(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function endoscopyCompPolicyField(value: FormDataEntryValue | null) {
  return typeof value === "string" &&
    Object.values(EndoscopyCompPolicy).includes(value as EndoscopyCompPolicy)
    ? (value as EndoscopyCompPolicy)
    : EndoscopyCompPolicy.BANK_PTO;
}
