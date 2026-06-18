import { z } from "zod";

const noteSchema = z.string().trim().max(1000).nullish();

const assignmentChangeSchema = z.object({
  assignmentId: z.string().trim().min(1),
  employeeId: z.string().trim().min(1).nullable(),
  locked: z.boolean(),
  note: noteSchema,
});

const addedAssignmentSchema = z.object({
  clientId: z.string().trim().min(1),
  slotId: z.string().trim().min(1),
  employeeId: z.string().trim().min(1),
  locked: z.boolean(),
  note: noteSchema,
});

const addedSlotSchema = z.object({
  clientId: z.string().trim().min(1),
  date: z.iso.date(),
  shiftBlockId: z.string().trim().min(1),
  taskTypeId: z.string().trim().min(1),
  employeeId: z.string().trim().min(1).nullable(),
  locked: z.boolean(),
  note: noteSchema,
});

export const manualEditBatchSchema = z.object({
  weekStart: z.iso.date(),
  revisions: z.array(
    z.object({
      scheduleDayId: z.string().trim().min(1),
      updatedAt: z.iso.datetime(),
    }),
  ),
  assignmentChanges: z.array(assignmentChangeSchema).max(500),
  addedAssignments: z.array(addedAssignmentSchema).max(500),
  addedSlots: z.array(addedSlotSchema).max(100),
  overrideReason: noteSchema,
});

export function manualEditBatchFromJson(value: string) {
  return manualEditBatchSchema.parse(JSON.parse(value));
}
