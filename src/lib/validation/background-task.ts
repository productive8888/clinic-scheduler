import { BackgroundTaskPeriodType } from "@prisma/client";
import { z } from "zod";

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null));

export const backgroundTaskCategoryFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .transform((value) => value.toUpperCase().replaceAll(" ", "_")),
  name: z.string().trim().min(1, "Name is required"),
  description: optionalTrimmedString,
  sortOrder: z.coerce.number().int().min(0).max(10000),
  active: z.boolean().default(false),
});

export const backgroundTaskDefinitionFormSchema = z
  .object({
    categoryId: z.string().min(1, "Category is required"),
    name: z.string().trim().min(1, "Task name is required"),
    description: optionalTrimmedString,
    estimatedHoursPerPeriod: z.coerce.number().min(0).max(500),
    periodType: z.nativeEnum(BackgroundTaskPeriodType),
    customPeriodDays: z.coerce.number().int().min(1).max(366).nullable(),
    priority: z.coerce.number().int().min(0).max(10000),
    mentor: optionalTrimmedString,
    primaryOwnerEmployeeId: z
      .union([z.string().min(1), z.literal("").transform(() => null)])
      .nullable(),
    canBePulledForClinic: z.boolean().default(false),
    rolloverAllowed: z.boolean().default(false),
    active: z.boolean().default(false),
    notes: optionalTrimmedString,
    eligibleEmployeeIds: z.array(z.string()).default([]),
    requiredSkillIds: z.array(z.string()).default([]),
  })
  .superRefine((value, context) => {
    if (value.periodType === "CUSTOM" && !value.customPeriodDays) {
      context.addIssue({
        code: "custom",
        path: ["customPeriodDays"],
        message: "Custom period tasks need a period length",
      });
    }
  });

export type BackgroundTaskCategoryFormValues = z.infer<
  typeof backgroundTaskCategoryFormSchema
>;
export type BackgroundTaskDefinitionFormValues = z.infer<
  typeof backgroundTaskDefinitionFormSchema
>;

export function backgroundTaskCategoryValuesFromFormData(formData: FormData) {
  return backgroundTaskCategoryFormSchema.parse({
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description"),
    sortOrder: formData.get("sortOrder"),
    active: formData.get("active") === "on",
  });
}

export function backgroundTaskDefinitionValuesFromFormData(formData: FormData) {
  const customPeriodDaysValue = formData.get("customPeriodDays");

  return backgroundTaskDefinitionFormSchema.parse({
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    description: formData.get("description"),
    estimatedHoursPerPeriod: formData.get("estimatedHoursPerPeriod"),
    periodType: formData.get("periodType"),
    customPeriodDays: customPeriodDaysValue ? customPeriodDaysValue : null,
    priority: formData.get("priority"),
    mentor: formData.get("mentor"),
    primaryOwnerEmployeeId: formData.get("primaryOwnerEmployeeId"),
    canBePulledForClinic: formData.get("canBePulledForClinic") === "on",
    rolloverAllowed: formData.get("rolloverAllowed") === "on",
    active: formData.get("active") === "on",
    notes: formData.get("notes"),
    eligibleEmployeeIds: formData.getAll("eligibleEmployeeIds").map(String),
    requiredSkillIds: formData.getAll("requiredSkillIds").map(String),
  });
}
