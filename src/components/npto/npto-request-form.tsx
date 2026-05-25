import type { Prisma } from "@prisma/client";
import { Send } from "lucide-react";
import { todayIsoDate } from "@/lib/utils/date";

type NPTOEmployeeOption = {
  id: string;
  fullName: string;
  email: string;
  ptoBalanceHours: Prisma.Decimal;
};

type NPTORequestFormProps = {
  action: (formData: FormData) => Promise<void>;
  employees?: NPTOEmployeeOption[];
  submitLabel?: string;
};

export function NPTORequestForm({
  action,
  employees,
  submitLabel = "Submit NPTO request",
}: NPTORequestFormProps) {
  const today = todayIsoDate();

  return (
    <form action={action} className="grid gap-4">
      {employees ? (
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Employee
          <select
            name="employeeId"
            required
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            <option value="">Select employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Start date
          <input
            name="startDate"
            type="date"
            required
            defaultValue={today}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          End date
          <input
            name="endDate"
            type="date"
            required
            defaultValue={today}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Time coverage
        <select
          name="duration"
          defaultValue="FULL_DAY"
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
        >
          <option value="FULL_DAY">Full day or full date range</option>
          <option value="PARTIAL_DAY">Specific time window</option>
        </select>
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Start time
          <input
            name="startTime"
            type="time"
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          End time
          <input
            name="endTime"
            type="time"
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
      </div>

      <p className="-mt-2 text-xs text-slate-500">
        NPTO is unpaid time off. It blocks staffing when approved, but it does
        not reduce PTO balance.
      </p>

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Reason
        <textarea
          name="reason"
          rows={3}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none focus:border-emerald-700"
        />
      </label>

      <button className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">
        <Send size={16} aria-hidden="true" />
        {submitLabel}
      </button>
    </form>
  );
}
