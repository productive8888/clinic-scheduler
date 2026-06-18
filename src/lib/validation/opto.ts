import { OptoAdjustmentType } from "@prisma/client";
import { z } from "zod";

export const optoAdjustmentSchema = z.object({
  employeeId: z.string().trim().min(1, "Employee is required."),
  adjustmentType: z.nativeEnum(OptoAdjustmentType),
  hours: z.coerce.number().finite().min(-10000).max(10000),
  effectiveDate: z.iso.date(),
  reason: z.string().trim().min(3, "A reason is required.").max(1000),
});

export type OptoAdjustmentValues = z.infer<typeof optoAdjustmentSchema>;

export function optoAdjustmentValuesFromFormData(formData: FormData) {
  return optoAdjustmentSchema.parse({
    employeeId: formData.get("employeeId"),
    adjustmentType: formData.get("adjustmentType"),
    hours: formData.get("hours"),
    effectiveDate: formData.get("effectiveDate"),
    reason: formData.get("reason"),
  });
}
