import { z } from "zod";

const quarterHour = z.coerce
  .number()
  .finite()
  .positive("Overtime hours must be greater than zero.")
  .max(168, "Overtime hours are too large.")
  .refine(
    (value) => Math.abs(value * 4 - Math.round(value * 4)) < 0.000001,
    "Use quarter-hour increments such as 0.25, 0.5, or 0.75.",
  );

export const overtimeEntrySchema = z.object({
  employeeId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  workDate: z.iso.date(),
  requestedHours: quarterHour,
  reason: z
    .string()
    .trim()
    .max(1000, "Notes must be 1000 characters or fewer.")
    .optional()
    .transform((value) => value || null),
});

export const overtimeReviewSchema = z.object({
  rejectionReason: z
    .string()
    .trim()
    .max(1000, "Review notes must be 1000 characters or fewer.")
    .optional()
    .transform((value) => value || null),
});

export type OvertimeEntryValues = z.infer<typeof overtimeEntrySchema>;

export function overtimeEntryValuesFromFormData(formData: FormData) {
  return overtimeEntrySchema.parse({
    employeeId: formData.get("employeeId"),
    workDate: formData.get("workDate"),
    requestedHours: formData.get("requestedHours"),
    reason: formData.get("reason"),
  });
}

export function overtimeReviewValuesFromFormData(formData: FormData) {
  return overtimeReviewSchema.parse({
    rejectionReason: formData.get("rejectionReason"),
  });
}
