import { Tags } from "lucide-react";
import { createBackgroundTaskCategoryAction } from "@/app/(app)/admin/background-tasks/actions";

export function BackgroundTaskCategoryForm() {
  return (
    <form action={createBackgroundTaskCategoryAction} className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[160px_1fr_140px_100px]">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Code
          <input
            name="code"
            required
            className="h-10 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Name
          <input
            name="name"
            required
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Sort order
          <input
            name="sortOrder"
            type="number"
            min="0"
            defaultValue={100}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700">
          <input
            name="active"
            type="checkbox"
            defaultChecked
            className="size-4 accent-emerald-700"
          />
          Active
        </label>
      </div>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Description
        <textarea
          name="description"
          rows={2}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none focus:border-emerald-700"
        />
      </label>
      <button className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800">
        <Tags size={16} aria-hidden="true" />
        Create category
      </button>
    </form>
  );
}
