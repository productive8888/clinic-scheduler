"use client";

import { AlertTriangle, CopyCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { manualAssignMultipleAction } from "@/app/(app)/schedule/actions";
import type { ManualAssignmentWarning } from "@/lib/schedule/manual-validation";

type SlotOption = {
  id: string;
  label: string;
  startMinute: number;
  endMinute: number;
};

export function MultiShiftAssignmentForm({
  employees,
  slots,
  warningMatrix,
}: {
  employees: { id: string; fullName: string }[];
  slots: SlotOption[];
  warningMatrix: Record<string, Record<string, ManualAssignmentWarning[]>>;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [slotIds, setSlotIds] = useState<string[]>([]);
  const warnings = useMemo(() => {
    const messages = new Set<string>();

    for (const slotId of slotIds) {
      for (const warning of warningMatrix[slotId]?.[employeeId] ?? []) {
        messages.add(warning.message);
      }
    }

    const selectedSlots = slots.filter((slot) => slotIds.includes(slot.id));
    for (let left = 0; left < selectedSlots.length; left += 1) {
      for (let right = left + 1; right < selectedSlots.length; right += 1) {
        if (
          selectedSlots[left].startMinute < selectedSlots[right].endMinute &&
          selectedSlots[right].startMinute < selectedSlots[left].endMinute
        ) {
          messages.add("Selected shift blocks overlap each other.");
        }
      }
    }

    return [...messages];
  }, [employeeId, slotIds, slots, warningMatrix]);

  return (
    <form
      action={manualAssignMultipleAction}
      className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4"
    >
      <div className="flex items-center gap-2">
        <CopyCheck size={17} className="text-emerald-700" aria-hidden="true" />
        <h2 className="font-semibold text-slate-950">Multi-shift assignment helper</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Employee
          <select
            name="employeeId"
            required
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 outline-none focus:border-emerald-700"
          >
            <option value="">Select employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Shift slots
          <select
            name="slotIds"
            multiple
            required
            value={slotIds}
            onChange={(event) =>
              setSlotIds(
                [...event.currentTarget.selectedOptions].map((option) => option.value),
              )
            }
            className="min-h-28 rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-emerald-700"
          >
            {slots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {warnings.length > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{warnings.join(" ")}</span>
        </div>
      ) : null}
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Override reason {warnings.length > 0 ? "(required)" : "(optional)"}
        <input
          name="overrideReason"
          required={warnings.length > 0}
          className="h-10 rounded-md border border-slate-300 bg-white px-3 outline-none focus:border-emerald-700"
        />
      </label>
      <button className="h-10 w-fit rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
        Assign selected shifts
      </button>
    </form>
  );
}
