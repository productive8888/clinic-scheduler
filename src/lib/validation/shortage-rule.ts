import { ClinicScenario, ShiftCategory } from "@prisma/client";
import { z } from "zod";

const emptyToNull = z.literal("").transform(() => null);
const optionalId = z.union([z.string().min(1), emptyToNull]).nullable();
const optionalDate = z.union([z.string().min(1), emptyToNull]).nullable();
const optionalScenario = z.union([z.nativeEnum(ClinicScenario), emptyToNull]).nullable();
const optionalShiftCategory = z
  .union([z.nativeEnum(ShiftCategory), emptyToNull])
  .nullable();
const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null));

export const shortageRuleFormSchema = z
  .object({
    taskTypeId: optionalId,
    shiftTemplateId: optionalId,
    shiftCategory: optionalShiftCategory,
    scenario: optionalScenario,
    closurePriority: z.coerce.number().int().min(0).max(10000),
    managerInstruction: z.string().trim().min(1, "Instruction is required"),
    active: z.boolean().default(false),
    effectiveStartDate: optionalDate,
    effectiveEndDate: optionalDate,
    notes: optionalTrimmedString,
  })
  .superRefine((value, context) => {
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

export type ShortageRuleFormValues = z.infer<typeof shortageRuleFormSchema>;

export function shortageRuleValuesFromFormData(formData: FormData) {
  return shortageRuleFormSchema.parse({
    taskTypeId: formData.get("taskTypeId"),
    shiftTemplateId: formData.get("shiftTemplateId"),
    shiftCategory: formData.get("shiftCategory"),
    scenario: formData.get("scenario"),
    closurePriority: formData.get("closurePriority"),
    managerInstruction: formData.get("managerInstruction"),
    active: formData.get("active") === "on",
    effectiveStartDate: formData.get("effectiveStartDate"),
    effectiveEndDate: formData.get("effectiveEndDate"),
    notes: formData.get("notes"),
  });
}
