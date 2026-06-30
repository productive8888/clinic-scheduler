"use client";

import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { useActionState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { scheduleWeekAction } from "@/app/(app)/schedule/actions";
import { PUBLISHED_DAYS_PARTIAL_GENERATION_WARNING } from "@/lib/schedule/range";
import {
  EMPTY_WEEK_ACTION_STATE,
  type WeekActionOperation,
} from "@/lib/schedule/week";

export function WeekScheduleActions({
  date,
  publishedDayCount,
}: {
  date: string;
  publishedDayCount: number;
}) {
  const [state, formAction] = useActionState(
    scheduleWeekAction,
    EMPTY_WEEK_ACTION_STATE,
  );

  function confirmAction(event: FormEvent<HTMLFormElement>) {
    const operation = (
      (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    )?.value as WeekActionOperation | undefined;
    const message =
      operation === "PARTIAL_GENERATE"
        ? "Run partial generation? Published days will be skipped and weekly balancing will not be authoritative."
        : operation === "FULL_REGENERATE"
          ? "Unpublish, clear, and regenerate the full week? Manual and locked overrides will be preserved."
          : null;

    if (message && !window.confirm(message)) {
      event.preventDefault();
    }
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-950">Week generation</h2>
          <p className="mt-1 text-sm text-slate-500">
            Whole-week generation is required for authoritative balancing.
          </p>
        </div>
        <form
          action={formAction}
          onSubmit={confirmAction}
          className="flex flex-wrap gap-2"
        >
          <input type="hidden" name="date" value={date} />
          <WeekActionButton
            operation="GENERATE"
            pendingLabel="Generating week…"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:bg-emerald-600"
          >
            <RefreshCw size={16} aria-hidden="true" />
            Generate this week
          </WeekActionButton>
          {publishedDayCount > 0 ? (
            <>
              <WeekActionButton
                operation="PARTIAL_GENERATE"
                pendingLabel="Running partial generation…"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-300 px-4 text-sm font-semibold text-amber-900 hover:bg-amber-50 disabled:cursor-wait disabled:bg-amber-50"
              >
                <AlertTriangle size={16} aria-hidden="true" />
                Skip published (partial)
              </WeekActionButton>
              <WeekActionButton
                operation="FULL_REGENERATE"
                pendingLabel="Rebuilding full week…"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-rose-300 px-4 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:cursor-wait disabled:bg-rose-50"
              >
                <RotateCcw size={16} aria-hidden="true" />
                Unpublish, clear, regenerate full week
              </WeekActionButton>
            </>
          ) : null}
        </form>
      </div>

      {publishedDayCount > 0 ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          {PUBLISHED_DAYS_PARTIAL_GENERATION_WARNING}
        </p>
      ) : null}

      <WeekActionResult state={state} />
    </section>
  );
}

function WeekActionButton({
  operation,
  pendingLabel,
  className,
  children,
}: {
  operation: WeekActionOperation;
  pendingLabel: string;
  className: string;
  children: React.ReactNode;
}) {
  const { pending, data } = useFormStatus();
  const isActive = pending && data?.get("operation") === operation;

  return (
    <button
      type="submit"
      name="operation"
      value={operation}
      disabled={pending}
      className={className}
    >
      {isActive ? (
        <>
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

function WeekActionResult({
  state,
}: {
  state: typeof EMPTY_WEEK_ACTION_STATE;
}) {
  if (state.outcome === "idle") {
    return null;
  }

  return (
    <section
      aria-live="polite"
      className={
        state.outcome === "success"
          ? "mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"
          : state.outcome === "error"
            ? "mt-4 rounded-md border border-rose-200 bg-rose-50 p-4 text-rose-950"
            : "mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-950"
      }
    >
      <h3 className="font-semibold">{state.message}</h3>
      {state.metrics.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {state.metrics.map((metric) => (
            <div key={metric.label} className="rounded-md bg-white/80 px-3 py-2">
              <div className="text-xs font-semibold uppercase opacity-70">
                {metric.label}
              </div>
              <div className="mt-1 text-lg font-semibold">{metric.value}</div>
            </div>
          ))}
        </div>
      ) : null}
      {state.issues.length > 0 ? (
        <ul className="mt-3 grid gap-1 text-sm">
          {state.issues.slice(0, 20).map((issue, index) => (
            <li key={`${issue}:${index}`}>{issue}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
