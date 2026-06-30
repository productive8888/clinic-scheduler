"use client";

import {
  CalendarX2,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useActionState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { scheduleMonthAction } from "@/app/(app)/schedule/actions";
import {
  EMPTY_MONTH_ACTION_STATE,
  type MonthActionOperation,
} from "@/lib/schedule/month";
import { formatDisplayDate } from "@/lib/utils/date";

export function MonthScheduleActions({
  date,
  generatedDayCount,
  publishedDayCount,
  hardRequirementDayCount,
}: {
  date: string;
  generatedDayCount: number;
  publishedDayCount: number;
  hardRequirementDayCount: number;
}) {
  const [state, formAction] = useActionState(
    scheduleMonthAction,
    EMPTY_MONTH_ACTION_STATE,
  );

  function confirmAction(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const operation = submitter?.value as MonthActionOperation | undefined;
    const formData = new FormData(event.currentTarget);
    let confirmation: string | null = null;

    if (
      operation === "FULL_REGENERATE" ||
      operation === "REGENERATE"
    ) {
      confirmation =
        "Unpublish, clear, and regenerate this full month? Generated output will be replaced, while manual and locked overrides remain.";
    } else if (operation === "PARTIAL_GENERATE") {
      confirmation =
        "Run partial generation? Published days will be skipped and weekly balancing will not be authoritative for affected weeks.";
    } else if (operation === "UNPUBLISH") {
      confirmation =
        "Unpublish every published day in this month? Assignments will be preserved.";
    } else if (operation === "CLEAR") {
      confirmation =
        "Clear generated output for this month? This removes generated assignments and safe generated slots.";
    } else if (
      operation === "PUBLISH" &&
      hardRequirementDayCount > 0 &&
      String(formData.get("overrideReason") || "").trim()
    ) {
      confirmation =
        "Publish with a manager override while hard requirements remain unmet?";
    }

    if (confirmation && !window.confirm(confirmation)) {
      event.preventDefault();
    }
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase text-emerald-800">
            Month workflow
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">
            Generate, review, and publish
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Generation runs week by week, skips Sundays, protects published
            days by default, and preserves manual or locked overrides.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-md bg-sky-50 px-2 py-1 text-sky-800">
            {generatedDayCount} generated
          </span>
          <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-800">
            {publishedDayCount} published
          </span>
          <span
            className={
              hardRequirementDayCount > 0
                ? "rounded-md bg-rose-50 px-2 py-1 text-rose-800"
                : "rounded-md bg-slate-100 px-2 py-1 text-slate-600"
            }
          >
            {hardRequirementDayCount} hard-review days
          </span>
        </div>
      </div>

      <form
        action={formAction}
        onSubmit={confirmAction}
        className="mt-5 grid gap-5"
      >
        <input type="hidden" name="date" value={date} />

        <div className="grid gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div>
            <h3 className="font-semibold text-slate-950">
              Generate or regenerate
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              A complete run can rebalance every week. Partial generation is
              available when published days must remain untouched.
            </p>
            {publishedDayCount > 0 ? (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                This month contains {publishedDayCount} published{" "}
                {publishedDayCount === 1 ? "day" : "days"}. Skipping them
                makes the affected weekly validation partial.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <MonthActionButton
              operation="GENERATE"
              pendingLabel="Generating month…"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:bg-emerald-600"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Generate month
            </MonthActionButton>
            <MonthActionButton
              operation="PARTIAL_GENERATE"
              pendingLabel="Running partial generation…"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:cursor-wait disabled:bg-emerald-50"
            >
              <RotateCcw size={16} aria-hidden="true" />
              Skip published (partial)
            </MonthActionButton>
            <MonthActionButton
              operation="FULL_REGENERATE"
              pendingLabel="Rebuilding full month…"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:cursor-wait disabled:bg-rose-50"
            >
              <RotateCcw size={16} aria-hidden="true" />
              Unpublish, clear, regenerate full month
            </MonthActionButton>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-950">Publish month</h3>
            <p className="mt-1 text-sm text-slate-500">
              Hard requirements block publishing unless a manager records an
              override reason.
            </p>
            <input
              name="overrideReason"
              placeholder="Override reason, only if publishing with unmet requirements"
              className="mt-3 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
            />
            <MonthActionButton
              operation="PUBLISH"
              pendingLabel="Publishing month…"
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-700"
            >
              <CheckCircle2 size={16} aria-hidden="true" />
              Publish month
            </MonthActionButton>
          </div>

          <div className="rounded-md border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-950">Unpublish month</h3>
            <p className="mt-1 text-sm text-slate-500">
              Returns published days to draft while keeping every assignment.
            </p>
            <MonthActionButton
              operation="UNPUBLISH"
              pendingLabel="Unpublishing month…"
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:bg-slate-100"
            >
              <CalendarX2 size={16} aria-hidden="true" />
              Unpublish month
            </MonthActionButton>
          </div>
        </div>

        <div className="rounded-md border border-rose-200 bg-rose-50 p-4">
          <h3 className="font-semibold text-rose-950">
            Clear generated month
          </h3>
          <p className="mt-1 text-sm text-rose-900">
            Generated assignments and safe generated slots are removed. Manual
            and locked overrides remain.
          </p>
          <div className="mt-3 grid gap-2 text-sm text-rose-950 sm:grid-cols-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="confirmClear"
                className="size-4 accent-rose-700"
              />
              Confirm generated clear
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="includePublished"
                className="size-4 accent-rose-700"
              />
              Include published days
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="confirmClearPublished"
                className="size-4 accent-rose-700"
              />
              Confirm published clear
            </label>
          </div>
          <MonthActionButton
            operation="CLEAR"
            pendingLabel="Clearing generated month…"
            className="mt-3 inline-flex h-10 items-center gap-2 rounded-md border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:cursor-wait disabled:bg-rose-100"
          >
            <Trash2 size={16} aria-hidden="true" />
            Clear generated month
          </MonthActionButton>
        </div>

        <MonthActionResult state={state} />
      </form>
    </section>
  );
}

function MonthActionButton({
  operation,
  pendingLabel,
  className,
  children,
}: {
  operation: MonthActionOperation;
  pendingLabel: string;
  className: string;
  children: React.ReactNode;
}) {
  const { pending, data } = useFormStatus();
  const activeOperation = data?.get("operation");
  const isActive = pending && activeOperation === operation;

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

function MonthActionResult({
  state,
}: {
  state: typeof EMPTY_MONTH_ACTION_STATE;
}) {
  if (state.outcome === "idle") {
    return null;
  }

  return (
    <section
      aria-live="polite"
      className={
        state.outcome === "success"
          ? "rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"
          : state.outcome === "error"
            ? "rounded-md border border-rose-200 bg-rose-50 p-4 text-rose-950"
            : "rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-950"
      }
    >
      <h3 className="font-semibold">{state.message}</h3>

      {state.metrics.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
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

      {state.weekSummaries.length > 0 ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {state.weekSummaries.map((week) => (
            <article
              key={week.startDate}
              className="rounded-md border border-current/10 bg-white/80 p-3"
            >
              <h4 className="font-semibold">
                {formatDisplayDate(week.startDate)}–{formatDisplayDate(week.endDate)}
              </h4>
              <p className="mt-1 text-xs opacity-75">
                {week.daysProcessed} processed / {week.daysCreated} created /{" "}
                {week.daysRegenerated} regenerated /{" "}
                {week.daysSkippedPublished} published skipped
              </p>
              {week.validationStatus === "PARTIAL" ? (
                <p className="mt-2 text-xs font-semibold text-amber-800">
                  Partial generation — {week.validationMessage}
                </p>
              ) : (
                <p className="mt-2 text-xs font-semibold">
                  Hard {week.hardRequirementIssues} · BG {week.bgMinimumIssues} ·
                  Work pattern {week.workPatternIssues} · Saturday{" "}
                  {week.saturdayIssues}
                </p>
              )}
              {week.employeesUnderTarget.length > 0 ? (
                <ul className="mt-2 grid gap-2 text-xs">
                  {week.employeesUnderTarget.map((employee) => (
                    <li key={employee.employeeId}>
                      <strong>
                        {employee.employeeName}: {employee.scheduledHours}/
                        {employee.targetHours}h
                      </strong>
                      {employee.blockers.length > 0
                        ? ` — ${employee.blockers.join(" ")}`
                        : " — No legal open shift remained in the generated month boundary."}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {state.issues.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Detailed issues ({state.issues.length})
          </summary>
          <ul className="mt-2 grid gap-1 text-sm">
            {state.issues.slice(0, 40).map((issue, index) => (
              <li key={`${issue}:${index}`}>{issue}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
