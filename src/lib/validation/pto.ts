import { PTORequestType, RequestStatus } from "@prisma/client";
import { z } from "zod";
import { timeStringToMinute } from "@/lib/utils/time";

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null));

export const ptoRequestFormSchema = z
  .object({
    employeeId: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value : null)),
    type: z.nativeEnum(PTORequestType),
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

    if (
      (value.startMinute === null && value.endMinute !== null) ||
      (value.startMinute !== null && value.endMinute === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["startMinute"],
        message: "Provide both start and end times, or leave both blank",
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

export const ptoReviewFormSchema = z.object({
  status: z.enum([RequestStatus.APPROVED, RequestStatus.REJECTED]),
  managerNote: optionalTrimmedString,
});

export type PTORequestFormValues = z.infer<typeof ptoRequestFormSchema>;
export type PTOReviewFormValues = z.infer<typeof ptoReviewFormSchema>;

export function ptoRequestValuesFromFormData(formData: FormData) {
  return ptoRequestFormSchema.parse({
    employeeId: formData.get("employeeId"),
    type: formData.get("type"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    startMinute: timeStringToMinute(String(formData.get("startTime") || "")),
    endMinute: timeStringToMinute(String(formData.get("endTime") || "")),
    reason: formData.get("reason"),
  });
}

export function ptoReviewValuesFromFormData(
  formData: FormData,
  status: "APPROVED" | "REJECTED",
) {
  return ptoReviewFormSchema.parse({
    status,
    managerNote: formData.get("managerNote"),
  });
}
