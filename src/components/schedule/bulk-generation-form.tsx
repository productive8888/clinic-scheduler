import { CalendarX2, Layers3 } from "lucide-react";
import {
  bulkGenerateScheduleAction,
  clearGeneratedScheduleRangeAction,
  unpublishScheduleRangeAction,
} from "@/app/(app)/schedule/actions";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";

export function BulkGenerationForm({ date }: { date: string }) {
  return (
    <details className="rounded-md border border-slate-200 bg-slate-50">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">
        Generate week, month, or range
      </summary>
      <div className="grid gap-4 border-t border-slate-200 p-4">
        <form action={bulkGenerateScheduleAction} className="grid gap-3 lg:grid-cols-4">
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
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              name="overwritePublished"
              className="size-4 accent-emerald-700"
            />
            Explicitly overwrite published dates
          </label>
          <PendingSubmitButton
            pendingLabel="Generating..."
            className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:bg-emerald-600 lg:col-span-4"
          >
            <Layers3 size={16} aria-hidden="true" />
            Generate range
          </PendingSubmitButton>
        </form>
        <form
          action={unpublishScheduleRangeAction}
          className="grid gap-3 border-t border-slate-200 pt-4 lg:grid-cols-4"
        >
          <input type="hidden" name="date" value={date} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Unpublish range
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
          <PendingSubmitButton
            pendingLabel="Unpublishing..."
            className="inline-flex h-10 w-fit items-center gap-2 self-end rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:bg-slate-100"
          >
            <CalendarX2 size={16} aria-hidden="true" />
            Unpublish range
          </PendingSubmitButton>
        </form>
        <form
          action={clearGeneratedScheduleRangeAction}
          className="grid gap-3 border-t border-rose-100 pt-4 lg:grid-cols-4"
        >
          <input type="hidden" name="date" value={date} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Clear generated
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
          <div className="grid gap-2 self-end text-sm font-medium text-slate-700">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="includePublished"
                className="size-4 accent-rose-700"
              />
              Include published dates
            </label>
            <label className="flex items-center gap-2 text-rose-800">
              <input
                type="checkbox"
                name="confirmClearPublished"
                className="size-4 accent-rose-700"
              />
              Confirm published clear
            </label>
          </div>
          <PendingSubmitButton
            pendingLabel="Clearing..."
            className="inline-flex h-10 w-fit items-center gap-2 rounded-md border border-rose-300 px-4 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:cursor-wait disabled:bg-rose-50 lg:col-span-4"
          >
            <CalendarX2 size={16} aria-hidden="true" />
            Clear generated range
          </PendingSubmitButton>
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
