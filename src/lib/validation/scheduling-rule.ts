import { SchedulingRuleType } from "@prisma/client";
import { z } from "zod";

export const supportedSchedulingRuleTypes = [
  SchedulingRuleType.PREFER_EMPLOYEE_FOR_TASK,
  SchedulingRuleType.AVOID_EMPLOYEE_FOR_TASK,
  SchedulingRuleType.PRIORITY_BOOST,
  SchedulingRuleType.PRIORITY_PENALTY,
  SchedulingRuleType.BACKUP_ONLY,
] as const;

const emptyToNull = z.literal("").transform(() => null);

const optionalId = z.union([z.string().min(1), emptyToNull]).nullable();

const optionalDate = z.union([z.string().min(1), emptyToNull]).nullable();

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null));

export const schedulingRuleFormSchema = z
  .object({
    type: z.enum(supportedSchedulingRuleTypes),
    employeeId: optionalId,
    taskTypeId: optionalId,
    weight: z.coerce.number().int().min(0).max(1000),
    active: z.boolean().default(false),
    effectiveStartDate: optionalDate,
    effectiveEndDate: optionalDate,
    notes: optionalTrimmedString,
  })
  .superRefine((value, context) => {
    if (
      (value.type === SchedulingRuleType.PREFER_EMPLOYEE_FOR_TASK ||
        value.type === SchedulingRuleType.AVOID_EMPLOYEE_FOR_TASK) &&
      !value.taskTypeId
    ) {
      context.addIssue({
        code: "custom",
        path: ["taskTypeId"],
        message: "Task type is required for employee-task rules",
      });
    }

    if (!value.employeeId) {
      context.addIssue({
        code: "custom",
        path: ["employeeId"],
        message: "Employee is required",
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

export type SchedulingRuleFormValues = z.infer<typeof schedulingRuleFormSchema>;

export function schedulingRuleValuesFromFormData(formData: FormData) {
  return schedulingRuleFormSchema.parse({
    type: formData.get("type"),
    employeeId: formData.get("employeeId"),
    taskTypeId: formData.get("taskTypeId"),
    weight: formData.get("weight"),
    active: formData.get("active") === "on",
    effectiveStartDate: formData.get("effectiveStartDate"),
    effectiveEndDate: formData.get("effectiveEndDate"),
    notes: formData.get("notes"),
  });
}
