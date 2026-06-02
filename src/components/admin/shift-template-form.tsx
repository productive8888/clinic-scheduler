import { ShiftCategory, type ShiftTemplate } from "@prisma/client";
import { Clock, Save } from "lucide-react";
import {
  createShiftTemplateAction,
  updateShiftTemplateAction,
} from "@/app/(app)/admin/shifts/actions";
import { toIsoDate } from "@/lib/utils/date";
import { minuteToTimeInput } from "@/lib/utils/time";

type ShiftTemplateFormProps = {
  template?: ShiftTemplate;
};

const weekdays = [
  { value: "", label: "Weekdays" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
];

export function ShiftTemplateForm({ template }: ShiftTemplateFormProps) {
  const action = template
    ? updateShiftTemplateAction.bind(null, template.id)
    : createShiftTemplateAction;

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-4">
        <label className="grid gap-1 text-sm font-medium text-slate-700 lg:col-span-2">
          Name
          <input
            name="name"
            required
            defaultValue={template?.name ?? ""}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Weekday
          <select
            name="dayOfWeek"
            defaultValue={template?.dayOfWeek?.toString() ?? ""}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            {weekdays.map((weekday) => (
              <option key={weekday.value} value={weekday.value}>
                {weekday.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Category
          <select
            name="shiftCategory"
            defaultValue={template?.shiftCategory ?? ShiftCategory.OTHER}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            {Object.values(ShiftCategory).map((category) => (
              <option key={category} value={category}>
                {formatEnumLabel(category)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Start
          <input
            name="startTime"
            type="time"
            required
            defaultValue={minuteToTimeInput(template?.startMinute ?? 8 * 60)}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          End
          <input
            name="endTime"
            type="time"
            required
            defaultValue={minuteToTimeInput(template?.endMinute ?? 17 * 60)}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Paid hours
          <input
            name="paidHours"
            type="number"
            step="0.25"
            min="0"
            max="24"
            defaultValue={template ? Number(template.paidHours) : 8}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700">
          <input
            name="defaultForSchedule"
            type="checkbox"
            defaultChecked={template?.defaultForSchedule ?? false}
            className="size-4 accent-emerald-700"
          />
          Default
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700">
          <input
            name="active"
            type="checkbox"
            defaultChecked={template?.active ?? true}
            className="size-4 accent-emerald-700"
          />
          Active
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Effective start
          <input
            name="effectiveStartDate"
            type="date"
            defaultValue={
              template?.effectiveStartDate ? toIsoDate(template.effectiveStartDate) : ""
            }
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Effective end
          <input
            name="effectiveEndDate"
            type="date"
            defaultValue={
              template?.effectiveEndDate ? toIsoDate(template.effectiveEndDate) : ""
            }
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Notes
        <textarea
          name="notes"
          rows={2}
          defaultValue={template?.notes ?? ""}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none focus:border-emerald-700"
        />
      </label>

      <button className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800">
        {template ? <Save size={16} aria-hidden="true" /> : <Clock size={16} aria-hidden="true" />}
        {template ? "Save shift template" : "Create shift template"}
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
