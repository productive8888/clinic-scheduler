import { ShiftCategory } from "@prisma/client";
import { z } from "zod";
import { timeStringToMinute } from "@/lib/utils/time";

const emptyToNull = z.literal("").transform(() => null);
const optionalDate = z.union([z.string().min(1), emptyToNull]).nullable();
const optionalWeekday = z
  .union([z.coerce.number().int().min(0).max(6), emptyToNull])
  .nullable();
const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null));

export const shiftTemplateFormSchema = z
  .object({
    name: z.string().trim().min(1, "Shift name is required"),
    dayOfWeek: optionalWeekday,
    startTime: z.string().min(1, "Start time is required"),
    endTime: z.string().min(1, "End time is required"),
    paidHours: z.coerce.number().min(0).max(24),
    shiftCategory: z.nativeEnum(ShiftCategory),
    defaultForSchedule: z.boolean().default(false),
    active: z.boolean().default(false),
    effectiveStartDate: optionalDate,
    effectiveEndDate: optionalDate,
    notes: optionalTrimmedString,
  })
  .superRefine((value, context) => {
    const startMinute = timeStringToMinute(value.startTime);
    const endMinute = timeStringToMinute(value.endTime);

    if (startMinute === null || endMinute === null || endMinute <= startMinute) {
      context.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "End time must be after start time",
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

export type ShiftTemplateFormValues = z.infer<typeof shiftTemplateFormSchema>;

export function shiftTemplateValuesFromFormData(formData: FormData) {
  return shiftTemplateFormSchema.parse({
    name: formData.get("name"),
    dayOfWeek: formData.get("dayOfWeek"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    paidHours: formData.get("paidHours"),
    shiftCategory: formData.get("shiftCategory"),
    defaultForSchedule: formData.get("defaultForSchedule") === "on",
    active: formData.get("active") === "on",
    effectiveStartDate: formData.get("effectiveStartDate"),
    effectiveEndDate: formData.get("effectiveEndDate"),
    notes: formData.get("notes"),
  });
}
