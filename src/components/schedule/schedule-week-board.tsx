import {
  AlertTriangle,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import {
  bulkGenerateScheduleAction,
  publishScheduleRangeAction,
  unpublishScheduleRangeAction,
} from "@/app/(app)/schedule/actions";
import { backgroundTaskDisplayName } from "@/lib/background/display";
import type { getScheduleWeekData } from "@/lib/db/schedule-workflows";
import { weekdayShortName } from "@/lib/easton-import/work-patterns";
import {
  addDaysIsoDate,
  enumerateIsoDates,
  formatDisplayDate,
  todayIsoDate,
} from "@/lib/utils/date";
import { formatCompactMinuteRange, formatMinuteOfDay } from "@/lib/utils/time";

type WeekData = Awaited<ReturnType<typeof getScheduleWeekData>>;

export function ScheduleWeekBoard({
  data,
  resultSummary,
}: {
  data: WeekData;
  resultSummary: Record<string, string | null>;
}) {
  const previousWeek = addDaysIsoDate(data.range.startDate, -7);
  const nextWeek = addDaysIsoDate(data.range.startDate, 7);
  const daysByDate = new Map(data.days.map((day) => [day.date, day]));
  const weekDates = enumerateIsoDates(data.range.startDate, data.range.endDate);
  const hasSummary = Object.values(resultSummary).some(Boolean);
  const backgroundSlotCount = data.days.reduce(
    (count, day) => count + day.backgroundSlotCount,
    0,
  );

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
          Week review
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <Link
            href={`/schedule/week?date=${previousWeek}`}
            className="inline-flex size-10 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
            aria-label="Previous week"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </Link>
          <h1 className="text-3xl font-semibold text-slate-950">
            {formatDisplayDate(data.range.startDate)} to{" "}
            {formatDisplayDate(data.range.endDate)}
          </h1>
          <Link
            href={`/schedule/week?date=${nextWeek}`}
            className="inline-flex size-10 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
            aria-label="Next week"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/schedule/week?date=${todayIsoDate()}`}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <CalendarDays size={16} aria-hidden="true" />
            Current week
          </Link>
          <Link
            href={`/schedule/calendar?date=${data.range.startDate}`}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <CalendarDays size={16} aria-hidden="true" />
            Calendar
          </Link>
          <form action="/schedule/week" className="flex gap-2">
            <input
              type="date"
              name="date"
              defaultValue={data.range.startDate}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
            />
            <button className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              Go
            </button>
          </form>
          <form action={bulkGenerateScheduleAction}>
            <input type="hidden" name="date" value={data.range.startDate} />
            <input type="hidden" name="mode" value="WEEK" />
            <input type="hidden" name="seedPrefix" value="clinic-week" />
            <button className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
              <RefreshCw size={16} aria-hidden="true" />
              Generate this week
            </button>
          </form>
          <form action={publishScheduleRangeAction}>
            <input type="hidden" name="date" value={data.range.startDate} />
            <input type="hidden" name="mode" value="WEEK" />
            <input
              name="overrideReason"
              placeholder="Override reason"
              className="mr-2 h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
            />
            <button className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
              <CheckCircle2 size={16} aria-hidden="true" />
              Publish this week
            </button>
          </form>
          <form action={unpublishScheduleRangeAction}>
            <input type="hidden" name="date" value={data.range.startDate} />
            <input type="hidden" name="mode" value="WEEK" />
            <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              <CalendarX2 size={16} aria-hidden="true" />
              Unpublish this week
            </button>
          </form>
          <Link
            href="/api/exports/calendar/clinic"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-200 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
          >
            <Download size={16} aria-hidden="true" />
            Export published calendar
          </Link>
        </div>
      </section>

      {hasSummary ? (
        <section className="grid gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 sm:grid-cols-3 lg:grid-cols-6">
          {Object.entries(resultSummary)
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <div className="text-xs font-semibold uppercase text-emerald-700">
                  {formatLabel(label)}
                </div>
                <div className="mt-1 text-lg font-semibold">{value}</div>
              </div>
            ))}
        </section>
      ) : null}

      {data.configurationWarnings.length > 0 ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <h2 className="font-semibold">Generation configuration needs attention</h2>
          <ul className="mt-2 grid gap-1">
            {data.configurationWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.publishBlockingDays.length > 0 ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <h2 className="font-semibold">Some days are not ready to publish</h2>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {data.publishBlockingDays.map((day) => (
              <div key={day.date} className="border-l-2 border-amber-400 pl-3">
                <div className="font-semibold">{formatDisplayDate(day.date)}</div>
                <div className="mt-1 text-xs">
                  {day.issues
                    .slice(0, 3)
                    .map((issue) => issue.message)
                    .join(" ")}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data.hardRequirements.issues.length > 0 ? (
        <section className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
          <h2 className="font-semibold">July hard requirements are unmet</h2>
          <p className="mt-1 text-rose-900">
            Publish is blocked until BG minimums and work-pattern rules are fixed,
            or a manager records an override in the schedule workflow.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {data.hardRequirements.issues.slice(0, 12).map((issue, index) => (
              <div
                key={`${issue.code}:${issue.employeeId ?? issue.employeeName}:${index}`}
                className="rounded-md bg-white px-3 py-2"
              >
                <div className="text-xs font-semibold uppercase text-rose-700">
                  {issue.code.replaceAll("_", " ")}
                </div>
                <div className="mt-1">{issue.message}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data.backgroundDefinitionCount === 0 &&
      data.backgroundStaffingRuleCount === 0 ? (
        <section className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          No active period-based background definitions or shift-specific background
          staffing rules are configured.
        </section>
      ) : backgroundSlotCount === 0 ? (
        <section className="rounded-md border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          {data.backgroundStaffingRuleCount} shift-specific background rules and{" "}
          {data.backgroundDefinitionCount} period-based background definitions are
          configured, but this week has no visible background slots yet. Generate this
          week to reconcile them into the schedule.
        </section>
      ) : null}

      {data.weeklyHourWarnings.length > 0 ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-950">
            Weekly hours and work-pattern warnings
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.weeklyHourWarnings.map((warning) => (
              <span
                key={warning.employeeId}
                className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-amber-900"
              >
                {warning.fullName}: {warning.scheduledHours}/{warning.targetHours} hours
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <StaffSummaryTable data={data} weekDates={weekDates} />

      <section className="grid gap-4">
        {weekDates.map((date) => {
          const day = daysByDate.get(date);

          return <WeekDayCard key={date} date={date} day={day} />;
        })}
      </section>
    </div>
  );
}

function StaffSummaryTable({
  data,
  weekDates,
}: {
  data: WeekData;
  weekDates: string[];
}) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold text-slate-950">Weekly staff summary</h2>
        <p className="mt-1 text-xs text-slate-500">
          Employee assignments by shift block, with workload and exposure totals.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1500px] border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 font-semibold">
                Employee
              </th>
              {weekDates.map((date) => (
                <th
                  key={date}
                  className="min-w-44 border-b border-r border-slate-200 px-3 py-2 font-semibold"
                >
                  {shortDateLabel(date)}
                </th>
              ))}
              <th className="min-w-56 border-b border-slate-200 px-3 py-2 font-semibold">
                Week totals
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.staffRows.map((row) => (
              <tr key={row.employeeId} className="align-top">
                <th className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-3">
                  <div className="font-semibold text-slate-950">{row.fullName}</div>
                  <div
                    className={
                      row.totalHours > row.targetHours
                        ? "mt-1 text-amber-700"
                        : row.totalHours < row.targetHours
                          ? "mt-1 text-rose-700"
                          : "mt-1 text-emerald-700"
                    }
                  >
                    {row.totalHours}/{row.targetHours} hours
                  </div>
                  {row.workPatternLabel ? (
                    <div className="mt-1 text-slate-500">
                      Group {row.workPatternLabel}
                    </div>
                  ) : null}
                  {row.hardRequirementIssues.length > 0 ? (
                    <div className="mt-1 text-rose-700">
                      {row.hardRequirementIssues.length} hard issue
                      {row.hardRequirementIssues.length === 1 ? "" : "s"}
                    </div>
                  ) : null}
                </th>
                {weekDates.map((date) => {
                  const assignments = row.assignmentsByDate[date] ?? [];

                  return (
                    <td
                      key={date}
                      className="border-r border-slate-200 px-3 py-3 text-slate-700"
                    >
                      {assignments.length > 0 ? (
                        <div className="grid gap-2">
                          {assignments.map((assignment, index) => (
                            <div
                              key={`${assignment.shiftBlockId}:${assignment.taskTypeCode}:${index}`}
                              className={
                                assignment.isBackground
                                  ? "border-l-2 border-sky-400 pl-2"
                                  : "border-l-2 border-emerald-500 pl-2"
                              }
                            >
                              <div className="font-mono font-semibold text-slate-900">
                                {formatCompactMinuteRange(
                                  assignment.startMinute,
                                  assignment.endMinute,
                                )}
                              </div>
                              <div className="mt-0.5 font-semibold">
                                {backgroundTaskDisplayName({
                                  name: assignment.taskTypeName,
                                  isBackground: assignment.isBackground,
                                })}
                                {assignment.locked ? " / Locked" : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">No assignment</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-slate-700">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <span>Patient shifts</span>
                    <strong>{row.patientFacingShiftCount}</strong>
                    <span>Background shifts</span>
                    <strong>{row.backgroundShiftCount}</strong>
                    <span>BG/background min</span>
                    <strong>
                      {row.backgroundAssignmentCount}/
                      {row.requiredBackgroundAssignments}
                      {row.missingBackgroundAssignments > 0
                        ? ` missing ${row.missingBackgroundAssignments}`
                        : ""}
                    </strong>
                    <span>Required extra</span>
                    <strong>
                      {row.extraHourWeekdays.length
                        ? row.extraHourWeekdays.map(weekdayShortName).join(", ")
                        : "None"}
                    </strong>
                    <span>Satisfied extra</span>
                    <strong>
                      {row.satisfiedExtraHourWeekdays.length
                        ? row.satisfiedExtraHourWeekdays
                            .map(weekdayShortName)
                            .join(", ")
                        : "None"}
                    </strong>
                    <span>Missing extra</span>
                    <strong
                      className={
                        row.missingExtraHourWeekdays.length
                          ? "text-rose-700"
                          : undefined
                      }
                    >
                      {row.missingExtraHourWeekdays.length
                        ? row.missingExtraHourWeekdays
                            .map((weekday) =>
                              weekday === 1
                                ? "Mon 0700-1200 or 1300-1800"
                                : `${weekdayShortName(weekday)} 0700-1200`,
                            )
                            .join(", ")
                        : "None"}
                    </strong>
                    <span>Saturday block</span>
                    <strong>
                      {row.saturdayAssignment
                        ? formatCompactMinuteRange(
                            row.saturdayAssignment.startMinute ?? 0,
                            row.saturdayAssignment.endMinute ?? 0,
                          )
                        : row.requiredSaturdayShiftCategory
                          ? `Missing ${row.requiredSaturdayShiftCategory} ${row.requiredSaturdayPaidHours}h`
                          : `${row.saturdayEndoscopyCount}`}
                    </strong>
                    <span>GI / Allergy / PCP</span>
                    <strong>
                      {row.exposure.GI} / {row.exposure.ALLERGY} / {row.exposure.PCP}
                    </strong>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WeekDayCard({
  date,
  day,
}: {
  date: string;
  day: WeekData["days"][number] | undefined;
}) {
  if (!day) {
    return (
      <article className="rounded-md border border-dashed border-slate-300 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-950">{formatDisplayDate(date)}</h2>
          <Link
            href={`/schedule?date=${date}`}
            className="text-sm font-semibold text-emerald-800 hover:underline"
          >
            Open whole day
          </Link>
        </div>
        <p className="mt-2 text-sm text-slate-500">Not prepared yet.</p>
      </article>
    );
  }

  return (
    <details className="rounded-md border border-slate-200 bg-white shadow-sm">
      <summary className="grid cursor-pointer gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-950">{formatDisplayDate(date)}</h2>
            <StatusBadge status={day.status} />
            {day.shortageCount > 0 || day.unfilledRequiredCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                <AlertTriangle size={13} aria-hidden="true" />
                {day.unfilledRequiredCount} required unfilled
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {day.scenario.replaceAll("_", " ")} / {day.shiftBlocks.length} shifts /{" "}
            {day.assignmentCount} assignments / {day.filledClinicSlotCount} clinic
            filled / {day.unfilledClinicSlotCount} clinic unfilled /{" "}
            {day.backgroundSlotCount} background / PTO {day.ptoCount} / NPTO{" "}
            {day.nptoCount}
          </p>
        </div>
        <Link
          href={`/schedule?date=${date}`}
          className="text-sm font-semibold text-emerald-800 hover:underline"
        >
          Open whole day
        </Link>
      </summary>
      <div className="grid gap-4 border-t border-slate-200 p-4">
        {day.shiftBlocks.map((shiftBlock) => {
          const slots = day.taskSlots.filter(
            (slot) => slot.shiftBlockId === shiftBlock.id,
          );

          return (
            <div key={shiftBlock.id}>
              <h3 className="font-semibold text-slate-900">
                {shiftBlock.name} / {formatMinuteOfDay(shiftBlock.startMinute)}-
                {formatMinuteOfDay(shiftBlock.endMinute)}
              </h3>
              {slots.length > 0 ? (
                <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {slots.map((slot) => (
                    <div
                      key={slot.id}
                      className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"
                    >
                      <div className="font-semibold text-slate-900">
                        {backgroundTaskDisplayName({
                          name: slot.label ?? slot.taskType.name,
                          isBackground: slot.taskType.isBackground,
                        })}
                      </div>
                      <div className="mt-1 text-slate-500">
                        {slot.assignments.length
                          ? slot.assignments
                              .map((assignment) => assignment.employee.fullName)
                              .join(", ")
                          : "Unfilled"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  No roles configured for this shift.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={
        status === "PUBLISHED"
          ? "rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
          : status === "NEEDS_REGENERATION"
            ? "rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-800"
          : "rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
      }
    >
      {status}
    </span>
  );
}

function formatLabel(value: string) {
  return value.replace(/([A-Z])/g, " $1").trim();
}

function shortDateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}
