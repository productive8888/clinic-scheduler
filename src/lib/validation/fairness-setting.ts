import { FairnessWindowType } from "@prisma/client";
import { z } from "zod";

const emptyToNull = z.literal("").transform(() => null);
const optionalDate = z.union([z.string().min(1), emptyToNull]).nullable();
const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null));

export const fairnessSettingFormSchema = z
  .object({
    windowType: z.nativeEnum(FairnessWindowType),
    customStartDate: optionalDate,
    customEndDate: optionalDate,
    clinicalShiftWeight: z.coerce.number().int().min(0).max(200),
    totalShiftWeight: z.coerce.number().int().min(0).max(200),
    totalHoursWeight: z.coerce.number().int().min(0).max(200),
    saturdayShiftWeight: z.coerce.number().int().min(0).max(200),
    endoscopyShiftWeight: z.coerce.number().int().min(0).max(200),
    patternConsistencyWeight: z.coerce.number().int().min(0).max(200),
    patientFacingShiftWeight: z.coerce.number().int().min(0).max(200),
    skillRoleBalanceWeight: z.coerce.number().int().min(0).max(200),
    exposureGoalWeight: z.coerce.number().int().min(0).max(200),
    backgroundPenaltyWeight: z.coerce.number().int().min(0).max(200),
    active: z.boolean().default(false),
    notes: optionalTrimmedString,
  })
  .superRefine((value, context) => {
    if (value.windowType === "CUSTOM") {
      if (!value.customStartDate) {
        context.addIssue({
          code: "custom",
          path: ["customStartDate"],
          message: "Custom fairness windows need a start date",
        });
      }

      if (!value.customEndDate) {
        context.addIssue({
          code: "custom",
          path: ["customEndDate"],
          message: "Custom fairness windows need an end date",
        });
      }
    }

    if (
      value.customStartDate &&
      value.customEndDate &&
      value.customEndDate < value.customStartDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["customEndDate"],
        message: "Custom end date must be on or after start date",
      });
    }
  });

export type FairnessSettingFormValues = z.infer<typeof fairnessSettingFormSchema>;

export function fairnessSettingValuesFromFormData(formData: FormData) {
  return fairnessSettingFormSchema.parse({
    windowType: formData.get("windowType"),
    customStartDate: formData.get("customStartDate"),
    customEndDate: formData.get("customEndDate"),
    clinicalShiftWeight: formData.get("clinicalShiftWeight"),
    totalShiftWeight: formData.get("totalShiftWeight"),
    totalHoursWeight: formData.get("totalHoursWeight"),
    saturdayShiftWeight: formData.get("saturdayShiftWeight"),
    endoscopyShiftWeight: formData.get("endoscopyShiftWeight"),
    patternConsistencyWeight: formData.get("patternConsistencyWeight"),
    patientFacingShiftWeight: formData.get("patientFacingShiftWeight"),
    skillRoleBalanceWeight: formData.get("skillRoleBalanceWeight"),
    exposureGoalWeight: formData.get("exposureGoalWeight"),
    backgroundPenaltyWeight: formData.get("backgroundPenaltyWeight"),
    active: formData.get("active") === "on",
    notes: formData.get("notes"),
  });
}
