"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { manualAssignAction } from "@/app/(app)/schedule/actions";
import type { ManualAssignmentWarning } from "@/lib/schedule/manual-validation";

export function ManualAssignmentForm({
  slotId,
  currentEmployeeId,
  employees,
  warningsByEmployee,
}: {
  slotId: string;
  currentEmployeeId?: string | null;
  employees: { id: string; fullName: string }[];
  warningsByEmployee: Record<string, ManualAssignmentWarning[]> | undefined;
}) {
  const [employeeId, setEmployeeId] = useState(currentEmployeeId ?? "");
  const warnings =
    employeeId === (currentEmployeeId ?? "")
      ? []
      : warningsByEmployee?.[employeeId || "__CLEAR__"] ?? [];

  return (
    <form action={manualAssignAction.bind(null, slotId)} className="mt-4 grid gap-2">
      <div className="flex gap-2">
        <select
          name="employeeId"
          value={employeeId}
          onChange={(event) => setEmployeeId(event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
        >
          <option value="">Unassigned</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.fullName}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          Save
        </button>
      </div>
      {warnings.length > 0 ? (
        <div className="grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2 text-xs font-semibold text-amber-900">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{warnings.map((warning) => warning.message).join(" ")}</span>
          </div>
          <input
            name="overrideReason"
            required
            placeholder="Required override reason"
            className="h-9 rounded-md border border-amber-300 bg-white px-3 text-xs outline-none focus:border-amber-600"
          />
        </div>
      ) : null}
    </form>
  );
}
