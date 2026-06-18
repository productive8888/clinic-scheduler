import { Minus, Plus, Replace } from "lucide-react";
import { createOptoAdjustmentAction } from "@/app/(app)/admin/opto/actions";
import { todayIsoDate } from "@/lib/utils/date";

type OptoAdjustmentFormProps = {
  employees: Array<{
    id: string;
    fullName: string;
    optoBalanceHours: unknown;
  }>;
};

export function OptoAdjustmentForm({ employees }: OptoAdjustmentFormProps) {
  return (
    <form action={createOptoAdjustmentAction} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
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
                {employee.fullName} · {Number(employee.optoBalanceHours).toFixed(2)}h
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Effective date
          <input
            name="effectiveDate"
            type="date"
            required
            defaultValue={todayIsoDate()}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Adjustment
          <select
            name="adjustmentType"
            defaultValue="CREDIT"
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
          >
            <option value="CREDIT">Add hours</option>
            <option value="DEBIT">Subtract hours</option>
            <option value="SET_BALANCE">Set exact balance</option>
            <option value="CORRECTION">Signed correction (+/-)</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Hours
          <input
            name="hours"
            type="number"
            required
            min="-10000"
            max="10000"
            step="0.25"
            placeholder="0.00"
            className="h-10 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm outline-none focus:border-emerald-700"
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Reason
        <textarea
          name="reason"
          required
          minLength={3}
          rows={3}
          placeholder="Why is this OPTO balance changing?"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-700"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
          <Plus size={16} aria-hidden="true" />
          Save adjustment
        </button>
        <p className="inline-flex items-center gap-2 text-xs text-slate-500">
          <Minus size={14} aria-hidden="true" />
          Negative OPTO balances are allowed.
          <Replace size={14} aria-hidden="true" />
          Set balance records the difference; corrections accept a signed
          amount.
        </p>
      </div>
    </form>
  );
}
