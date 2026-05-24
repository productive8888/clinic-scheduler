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

const visibleRequestTypes: PTORequestType[] = [
  "PERSONAL",
  "VACATION",
  "SICK",
  "EMERGENCY",
];

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
            defaultValue="PERSONAL"
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            {visibleRequestTypes.map((type) => (
              <option key={type} value={type}>
                {formatEnumLabel(type)}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-slate-500">
            Personal and vacation requests need manager approval. Sick and
            emergency requests are approved automatically.
          </span>
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
        Leave time coverage on full day for all-day PTO or absence. Use a specific
        time window for partial-day unavailability.
      </p>

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
