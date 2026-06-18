import {
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
  Save,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";

type ManualEditTopbarProps = {
  weekStart: string;
  weekEnd: string;
  changeCount: number;
  pending: boolean;
  overrideReason: string;
  needsReason: boolean;
  onOverrideReasonChange: (value: string) => void;
  onValidate: () => void;
  onDiscard: () => void;
  onSave: () => void;
};

export function ManualEditTopbar({
  weekStart,
  weekEnd,
  changeCount,
  pending,
  overrideReason,
  needsReason,
  onOverrideReasonChange,
  onValidate,
  onDiscard,
  onSave,
}: ManualEditTopbarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
      <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-3 lg:px-6">
        <Link
          href={`/schedule/week?date=${weekStart}`}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Week review
        </Link>
        <div className="min-w-48">
          <h1 className="text-lg font-semibold text-slate-950">
            Manual schedule edit
          </h1>
          <p className="font-mono text-xs text-slate-500">
            {weekStart} — {weekEnd}
          </p>
        </div>
        <div
          className={
            changeCount > 0
              ? "inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800"
              : "inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"
          }
        >
          <ShieldAlert size={16} aria-hidden="true" />
          {changeCount > 0 ? `${changeCount} unsaved changes` : "No pending changes"}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {needsReason ? (
            <input
              value={overrideReason}
              onChange={(event) => onOverrideReasonChange(event.target.value)}
              placeholder="Manager override reason"
              aria-label="Manager override reason"
              className="h-10 min-w-56 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm outline-none focus:border-amber-600"
            />
          ) : null}
          <button
            type="button"
            onClick={onValidate}
            disabled={pending || changeCount === 0}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 size={16} aria-hidden="true" />
            Validate
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={pending || changeCount === 0}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw size={16} aria-hidden="true" />
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={
              pending ||
              changeCount === 0 ||
              (needsReason && !overrideReason.trim())
            }
            className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Save size={16} aria-hidden="true" />
            {pending ? "Working…" : "Save manual edits"}
          </button>
        </div>
      </div>
    </header>
  );
}
