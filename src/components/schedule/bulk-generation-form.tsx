import { Layers3, Upload } from "lucide-react";
import {
  bulkGenerateScheduleAction,
  publishScheduleRangeAction,
} from "@/app/(app)/schedule/actions";

export function BulkGenerationForm({ date }: { date: string }) {
  return (
    <details className="rounded-md border border-slate-200 bg-slate-50">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">
        Bulk generation and publishing
      </summary>
      <div className="grid gap-4 border-t border-slate-200 p-4">
        <form action={bulkGenerateScheduleAction} className="grid gap-3 lg:grid-cols-5">
          <input type="hidden" name="date" value={date} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Range
            <select
              name="mode"
              defaultValue="WEEK"
              className="h-10 rounded-md border border-slate-300 bg-white px-3"
            >
              <option value="DAY">Selected day</option>
              <option value="WEEK">Whole week</option>
              <option value="MONTH">Whole month</option>
              <option value="CUSTOM">Custom range</option>
            </select>
          </label>
          <DateField name="startDate" label="Custom start" defaultValue={date} />
          <DateField name="endDate" label="Custom end" defaultValue={date} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Seed prefix
            <input
              name="seedPrefix"
              defaultValue="clinic-bulk"
              className="h-10 rounded-md border border-slate-300 bg-white px-3 font-mono text-xs"
            />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              name="overwritePublished"
              className="size-4 accent-emerald-700"
            />
            Explicitly overwrite published dates
          </label>
          <button className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 lg:col-span-5">
            <Layers3 size={16} aria-hidden="true" />
            Generate range
          </button>
        </form>

        <form
          action={publishScheduleRangeAction}
          className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-[180px_auto]"
        >
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="mode" value="WEEK" />
          <p className="text-sm text-slate-600">
            Publish every generated, shortage-free day in the selected clinic week.
          </p>
          <button className="inline-flex h-10 w-fit items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <Upload size={16} aria-hidden="true" />
            Publish this week
          </button>
        </form>
      </div>
    </details>
  );
}

function DateField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <input
        name={name}
        type="date"
        defaultValue={defaultValue}
        className="h-10 rounded-md border border-slate-300 bg-white px-3"
      />
    </label>
  );
}
