import { RequestStatus } from "@prisma/client";
import { z } from "zod";
import { timeStringToMinute } from "@/lib/utils/time";

const optionalTrimmedString = z
  .preprocess(
    (value) => (value === null ? undefined : value),
    z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value : null)),
  );

const optionalId = z.preprocess(
  (value) => (value === null || value === "" ? undefined : value),
  z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
);

export const nptoRequestFormSchema = z
  .object({
    employeeId: optionalId,
    duration: z.enum(["FULL_DAY", "PARTIAL_DAY"]).default("FULL_DAY"),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
    startMinute: z.number().int().min(0).max(1439).nullable(),
    endMinute: z.number().int().min(1).max(1440).nullable(),
    reason: optionalTrimmedString,
  })
  .superRefine((value, context) => {
    if (value.endDate < value.startDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date must be on or after start date",
      });
    }

    if (value.duration === "FULL_DAY") {
      return;
    }

    if (value.startMinute === null || value.endMinute === null) {
      context.addIssue({
        code: "custom",
        path: ["startMinute"],
        message: "Provide start and end times for a specific time window",
      });
    }

    if (
      value.startMinute !== null &&
      value.endMinute !== null &&
      value.endMinute <= value.startMinute
    ) {
      context.addIssue({
        code: "custom",
        path: ["endMinute"],
        message: "End time must be after start time",
      });
    }
  });

export const nptoReviewFormSchema = z.object({
  status: z.enum([RequestStatus.APPROVED, RequestStatus.REJECTED]),
  managerNote: optionalTrimmedString,
});

export const nptoSettingsFormSchema = z.object({
  nptoCapHours: z.coerce.number().min(0).max(10000),
});

export type NPTORequestFormValues = z.infer<typeof nptoRequestFormSchema>;
export type NPTOReviewFormValues = z.infer<typeof nptoReviewFormSchema>;
export type NPTOSettingsFormValues = z.infer<typeof nptoSettingsFormSchema>;

export function nptoRequestValuesFromFormData(formData: FormData) {
  const duration = String(formData.get("duration") || "FULL_DAY");

  return nptoRequestFormSchema.parse({
    employeeId: formData.get("employeeId"),
    duration,
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    startMinute:
      duration === "PARTIAL_DAY"
        ? timeStringToMinute(String(formData.get("startTime") || ""))
        : null,
    endMinute:
      duration === "PARTIAL_DAY"
        ? timeStringToMinute(String(formData.get("endTime") || ""))
        : null,
    reason: formData.get("reason"),
  });
}

export function nptoReviewValuesFromFormData(
  formData: FormData,
  status: "APPROVED" | "REJECTED",
) {
  return nptoReviewFormSchema.parse({
    status,
    managerNote: formData.get("managerNote"),
  });
}

export function nptoSettingsValuesFromFormData(formData: FormData) {
  return nptoSettingsFormSchema.parse({
    nptoCapHours: formData.get("nptoCapHours"),
  });
}
