import { PTORequestType, type Prisma } from "@prisma/client";
import { Send } from "lucide-react";
import { todayIsoDate } from "@/lib/utils/date";

type PTOEmployeeOption = {
  id: string;
  fullName: string;
  email: string;
  ptoBalanceHours: Prisma.Decimal;
};

type PTORequestFormProps = {
  action: (formData: FormData) => Promise<void>;
  employees?: PTOEmployeeOption[];
  submitLabel?: string;
};

const requestTypes = Object.values(PTORequestType);

export function PTORequestForm({
  action,
  employees,
  submitLabel = "Submit request",
}: PTORequestFormProps) {
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
                {employee.fullName} ({employee.ptoBalanceHours.toString()}h)
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Request type
          <select
            name="type"
            defaultValue="PTO"
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            {requestTypes.map((type) => (
              <option key={type} value={type}>
                {formatEnumLabel(type)}
              </option>
            ))}
          </select>
        </label>
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

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Reason
        <textarea
          name="reason"
          rows={3}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none focus:border-emerald-700"
        />
      </label>

      <button className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800">
        <Send size={16} aria-hidden="true" />
        {submitLabel}
      </button>
    </form>
  );
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
