import {
  AlertTriangle,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  bulkGenerateScheduleAction,
  generateScheduleAction,
  publishScheduleAction,
  publishScheduleRangeAction,
  unpublishScheduleAction,
  unpublishScheduleRangeAction,
} from "@/app/(app)/schedule/actions";
import type { getScheduleCalendarData } from "@/lib/db/schedule-workflows";
import {
  addMonthsIsoDate,
  todayIsoDate,
} from "@/lib/utils/date";

type CalendarData = Awaited<ReturnType<typeof getScheduleCalendarData>>;
type CalendarDay = CalendarData["weeks"][number][number];

export function ScheduleCalendar({ data }: { data: CalendarData }) {
  const previousMonth = addMonthsIsoDate(data.range.monthStartDate, -1);
  const nextMonth = addMonthsIsoDate(data.range.monthStartDate, 1);

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium uppercase text-emerald-800">
          Schedule status calendar
        </p>
        <div className="mt-1 flex items-center gap-3">
          <Link
            href={`/schedule/calendar?date=${previousMonth}`}
            aria-label="Previous month"
            className="inline-flex size-10 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </Link>
          <h1 className="min-w-0 flex-1 text-2xl font-semibold text-slate-950 sm:text-3xl">
            {monthLabel(data.range.monthStartDate)}
          </h1>
          <Link
            href={`/schedule/calendar?date=${nextMonth}`}
            aria-label="Next month"
            className="inline-flex size-10 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/schedule/calendar?date=${todayIsoDate()}`}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <CalendarDays size={16} aria-hidden="true" />
            Current month
          </Link>
          <Link
            href={`/schedule/week?date=${data.range.monthStartDate}`}
            className="inline-flex h-10 items-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Open week review
          </Link>
          <RangeActionForm
            action={bulkGenerateScheduleAction}
            date={data.range.monthStartDate}
            label="Generate month"
            icon={<RefreshCw size={16} aria-hidden="true" />}
            primary
          />
          <RangeActionForm
            action={publishScheduleRangeAction}
            date={data.range.monthStartDate}
            label="Publish month"
            icon={<CheckCircle2 size={16} aria-hidden="true" />}
          />
          <RangeActionForm
            action={unpublishScheduleRangeAction}
            date={data.range.monthStartDate}
            label="Unpublish month"
            icon={<CalendarX2 size={16} aria-hidden="true" />}
          />
        </div>
      </section>

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

      <section className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold uppercase text-slate-600">
            {weekdayLabels.map((label) => (
              <div key={label} className="border-r border-slate-200 px-2 py-2 last:border-r-0">
                {label}
              </div>
            ))}
          </div>
          <div className="grid">
            {data.weeks.map((week) => (
              <div key={week[0].date} className="grid grid-cols-7 border-b border-slate-200 last:border-b-0">
                {week.map((day) => (
                  <CalendarDayCell key={day.date} day={day} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function CalendarDayCell({ day }: { day: CalendarDay }) {
  return (
    <article
      className={
        day.inMonth
          ? "min-h-48 border-r border-slate-200 p-2 last:border-r-0"
          : "min-h-48 border-r border-slate-200 bg-slate-50 p-2 text-slate-400 last:border-r-0"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/schedule?date=${day.date}`}
          className="font-semibold text-slate-950 hover:text-emerald-800"
        >
          {dayNumber(day.date)}
        </Link>
        <span className={statusClassName(day.status)}>{formatStatus(day.status)}</span>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-slate-600">
        <span>{day.shiftBlockCount} shifts / {day.assignmentCount} assignments</span>
        {day.unfilledRequiredCount > 0 || day.shortageCount > 0 ? (
          <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
            <AlertTriangle size={12} aria-hidden="true" />
            {day.unfilledRequiredCount} required / {day.shortageCount} shortages
          </span>
        ) : null}
        {day.ptoCount > 0 || day.nptoCount > 0 ? (
          <span>PTO {day.ptoCount} / NPTO {day.nptoCount}</span>
        ) : null}
      </div>
      {day.inMonth ? (
        <div className="mt-3 grid gap-1">
          {day.status !== "PUBLISHED" ? (
            <form action={generateScheduleAction}>
              <input type="hidden" name="date" value={day.date} />
              <button className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                <RefreshCw size={13} aria-hidden="true" />
                {day.status === "NOT_GENERATED" ? "Generate" : "Regenerate"}
              </button>
            </form>
          ) : null}
          {day.canUnpublish ? (
            <form action={unpublishScheduleAction}>
              <input type="hidden" name="date" value={day.date} />
              <button className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                <CalendarX2 size={13} aria-hidden="true" />
                Unpublish
              </button>
            </form>
          ) : (
            <form action={publishScheduleAction}>
              <input type="hidden" name="date" value={day.date} />
              <button
                disabled={!day.canPublish}
                className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-md border border-emerald-200 px-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              >
                <CheckCircle2 size={13} aria-hidden="true" />
                Publish
              </button>
            </form>
          )}
        </div>
      ) : null}
    </article>
  );
}

function RangeActionForm({
  action,
  date,
  label,
  icon,
  primary = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  date: string;
  label: string;
  icon: ReactNode;
  primary?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="mode" value="MONTH" />
      <button
        className={
          primary
            ? "inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800"
            : "inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        }
      >
        {icon}
        {label}
      </button>
    </form>
  );
}

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function dayNumber(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function formatStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

function statusClassName(status: string) {
  if (status === "PUBLISHED") {
    return "rounded-md bg-emerald-50 px-1.5 py-1 text-[10px] font-semibold uppercase text-emerald-800";
  }

  if (status === "NEEDS_REGENERATION") {
    return "rounded-md bg-rose-50 px-1.5 py-1 text-[10px] font-semibold uppercase text-rose-800";
  }

  if (status === "NOT_GENERATED") {
    return "rounded-md bg-slate-100 px-1.5 py-1 text-[10px] font-semibold uppercase text-slate-500";
  }

  return "rounded-md bg-sky-50 px-1.5 py-1 text-[10px] font-semibold uppercase text-sky-800";
}
