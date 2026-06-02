import {
  ClinicScenario,
  ShiftCategory,
  TaskSlotRequirementLevel,
} from "@prisma/client";
import { z } from "zod";

export const supportedTaskSlotRequirementLevels = [
  TaskSlotRequirementLevel.REQUIRED,
  TaskSlotRequirementLevel.DESIRED,
  TaskSlotRequirementLevel.OPTIONAL,
  TaskSlotRequirementLevel.CONDITIONAL,
] as const;

const emptyToNull = z.literal("").transform(() => null);
const optionalId = z.union([z.string().min(1), emptyToNull]).nullable();
const optionalDate = z.union([z.string().min(1), emptyToNull]).nullable();
const optionalScenario = z.union([z.nativeEnum(ClinicScenario), emptyToNull]).nullable();
const optionalShiftCategory = z
  .union([z.nativeEnum(ShiftCategory), emptyToNull])
  .nullable();
const optionalWeekday = z
  .union([z.coerce.number().int().min(0).max(6), emptyToNull])
  .nullable();
const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null));

export const staffingRequirementFormSchema = z
  .object({
    taskTypeId: z.string().min(1, "Task type is required"),
    shiftTemplateId: optionalId,
    shiftCategory: optionalShiftCategory,
    weekday: optionalWeekday,
    scenario: optionalScenario,
    minRequiredSlots: z.coerce.number().int().min(0).max(20),
    desiredSlots: z.coerce.number().int().min(0).max(20),
    maxSlots: z.coerce.number().int().min(0).max(20),
    requirementLevel: z.enum(supportedTaskSlotRequirementLevels),
    active: z.boolean().default(false),
    effectiveStartDate: optionalDate,
    effectiveEndDate: optionalDate,
    notes: optionalTrimmedString,
    createdByEmployeeId: optionalId.optional(),
  })
  .superRefine((value, context) => {
    if (value.desiredSlots < value.minRequiredSlots) {
      context.addIssue({
        code: "custom",
        path: ["desiredSlots"],
        message: "Desired slots must be at least the minimum required slots",
      });
    }

    if (value.maxSlots < value.desiredSlots) {
      context.addIssue({
        code: "custom",
        path: ["maxSlots"],
        message: "Max slots must be at least desired slots",
      });
    }

    if (
      value.effectiveStartDate &&
      value.effectiveEndDate &&
      value.effectiveEndDate < value.effectiveStartDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["effectiveEndDate"],
        message: "Effective end date must be on or after start date",
      });
    }
  });

export type StaffingRequirementFormValues = z.infer<
  typeof staffingRequirementFormSchema
>;

export function staffingRequirementValuesFromFormData(formData: FormData) {
  return staffingRequirementFormSchema.parse({
    taskTypeId: formData.get("taskTypeId"),
    shiftTemplateId: formData.get("shiftTemplateId"),
    shiftCategory: formData.get("shiftCategory"),
    weekday: formData.get("weekday"),
    scenario: formData.get("scenario"),
    minRequiredSlots: formData.get("minRequiredSlots"),
    desiredSlots: formData.get("desiredSlots"),
    maxSlots: formData.get("maxSlots"),
    requirementLevel: formData.get("requirementLevel"),
    active: formData.get("active") === "on",
    effectiveStartDate: formData.get("effectiveStartDate"),
    effectiveEndDate: formData.get("effectiveEndDate"),
    notes: formData.get("notes"),
  });
}
