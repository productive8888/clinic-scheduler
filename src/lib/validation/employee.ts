import { EmployeeRole, EmployeeStatus } from "@prisma/client";
import { z } from "zod";

const emptyToNull = z.literal("").transform(() => null);

export const employeeFormSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  email: z.string().trim().email("A valid email is required"),
  authProviderId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  role: z.nativeEnum(EmployeeRole),
  status: z.nativeEnum(EmployeeStatus),
  ptoBalanceHours: z.coerce.number().min(0).default(0),
  weeklyAssignmentLimit: z.preprocess(
    (value) => (value === "" ? null : value),
    z.coerce.number().int().positive().nullable(),
  ),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.union([z.string().min(1), emptyToNull]).nullable(),
  skillIds: z.array(z.string()).default([]),
  createDefaultAvailability: z.boolean().default(false),
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
    weeklyAssignmentLimit: formData.get("weeklyAssignmentLimit"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    skillIds: formData.getAll("skillIds"),
    createDefaultAvailability: formData.get("createDefaultAvailability") === "on",
  });
}
