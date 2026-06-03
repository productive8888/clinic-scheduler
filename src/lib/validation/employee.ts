import { EmployeeRole, EmployeeStatus } from "@prisma/client";
import { z } from "zod";
import { WEEKDAYS } from "@/lib/availability";
import { timeStringToMinute } from "@/lib/utils/time";

const emptyToNull = z.literal("").transform(() => null);

const availabilitySchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    active: z.boolean(),
    startMinute: z.coerce.number().int().min(0).max(1439),
    endMinute: z.coerce.number().int().min(1).max(1440),
  })
  .superRefine((value, context) => {
    if (value.active && value.endMinute <= value.startMinute) {
      context.addIssue({
        code: "custom",
        path: ["endMinute"],
        message: "End time must be after start time",
      });
    }
  });

export const employeeFormSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  email: z.string().trim().toLowerCase().email("A valid email is required"),
  authProviderId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  role: z.nativeEnum(EmployeeRole),
  status: z.nativeEnum(EmployeeStatus),
  ptoBalanceHours: z.coerce.number().min(-240).default(0),
  expectedWeeklyHours: z.coerce.number().min(0).max(80).default(40),
  weeklyAssignmentLimit: z.preprocess(
    (value) => (value === "" ? null : value),
    z.coerce.number().int().positive().nullable(),
  ),
  workPatternId: z.union([z.string().min(1), emptyToNull]).nullable(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.union([z.string().min(1), emptyToNull]).nullable(),
  skillIds: z.array(z.string()).default([]),
  availability: z.array(availabilitySchema).default([]),
});

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

export function employeeFormValuesFromFormData(formData: FormData) {
  return employeeFormSchema.parse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    authProviderId: formData.get("authProviderId"),
    role: formData.get("role"),
    status: formData.get("status"),
    ptoBalanceHours: formData.get("ptoBalanceHours"),
    expectedWeeklyHours: formData.get("expectedWeeklyHours"),
    weeklyAssignmentLimit: formData.get("weeklyAssignmentLimit"),
    workPatternId: formData.get("workPatternId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    skillIds: formData.getAll("skillIds"),
    availability: availabilityValuesFromFormData(formData),
  });
}

function availabilityValuesFromFormData(formData: FormData) {
  return WEEKDAYS.map((day) => {
    const startMinute =
      timeStringToMinute(
        stringField(formData.get(`availability.${day.value}.start`)),
      ) ?? 0;
    const endMinute =
      timeStringToMinute(stringField(formData.get(`availability.${day.value}.end`))) ??
      1440;

    return {
      weekday: day.value,
      active: formData.get(`availability.${day.value}.active`) === "on",
      startMinute,
      endMinute,
    };
  });
}

function stringField(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : null;
}
