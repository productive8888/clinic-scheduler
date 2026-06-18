import { ClockArrowUp } from "lucide-react";
import { todayIsoDate } from "@/lib/utils/date";

type OvertimeEntryFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  employees?: Array<{
    id: string;
    fullName: string;
    optoBalanceHours: unknown;
  }>;
  submitLabel?: string;
};

export function OvertimeEntryForm({
  action,
  employees,
  submitLabel = "Log overtime",
}: OvertimeEntryFormProps) {
  return (
    <form action={action} className="grid gap-4">
      {employees ? (
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Employee
          <select
            name="employeeId"
            required
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
          >
            <option value="">Select employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName} · {Number(employee.optoBalanceHours).toFixed(2)}h OPTO
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Date worked
          <input
            type="date"
            name="workDate"
            required
            defaultValue={todayIsoDate()}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Overtime hours worked
          <input
            type="number"
            name="requestedHours"
            required
            min="0.25"
            max="168"
            step="0.25"
            placeholder="0.00"
            className="h-10 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm outline-none focus:border-emerald-700"
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Reason or notes
        <textarea
          name="reason"
          rows={3}
          maxLength={1000}
          placeholder="Optional context for the manager reviewing this overtime."
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
        />
      </label>

      <button className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
        <ClockArrowUp size={16} aria-hidden="true" />
        {submitLabel}
      </button>
    </form>
  );
}
