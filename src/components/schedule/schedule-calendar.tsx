import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Layers3,
} from "lucide-react";
import Link from "next/link";
import { MonthScheduleActions } from "@/components/schedule/month-schedule-actions";
import { ScheduleIcsExport } from "@/components/schedule/schedule-ics-export";
import type { getScheduleCalendarData } from "@/lib/db/schedule-workflows";
import type { MonthDayTone } from "@/lib/schedule/month";
import { addMonthsIsoDate, todayIsoDate } from "@/lib/utils/date";

type CalendarData = Awaited<ReturnType<typeof getScheduleCalendarData>>;
type CalendarDay = CalendarData["weeks"][number][number];

export function ScheduleCalendar({ data }: { data: CalendarData }) {
  const previousMonth = addMonthsIsoDate(data.range.monthStartDate, -1);
  const nextMonth = addMonthsIsoDate(data.range.monthStartDate, 1);
  const monthDays = data.weeks.flat().filter((day) => day.inMonth);
  const generatedDayCount = monthDays.filter(
    (day) =>
      day.status !== "PUBLISHED" &&
      (day.shiftBlockCount > 0 || day.taskSlotCount > 0),
  ).length;

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium uppercase text-emerald-800">
          Month schedule
        </p>
        <div className="mt-1 flex items-center gap-3">
          <Link
            href={`/schedule/calendar?date=${previousMonth}`}
            aria-label="Previous month"
            className="inline-flex size-10 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </Link>
          <h1 className="min-w-0 flex-1 text-center text-2xl font-semibold text-slate-950 sm:text-3xl">
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

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link
            href={`/schedule/calendar?date=${todayIsoDate()}`}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <CalendarDays size={16} aria-hidden="true" />
            Current month
          </Link>
          <form action="/schedule/calendar" className="flex gap-2">
            <input
              type="month"
              name="date"
              defaultValue={data.range.monthStartDate.slice(0, 7)}
              aria-label="Jump to month"
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
            />
            <button className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              Jump
            </button>
          </form>
          <Link
            href={`/schedule/week?date=${data.range.monthStartDate}`}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <Layers3 size={16} aria-hidden="true" />
            Open week review
          </Link>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <MonthMetric
            label="Not generated"
            value={data.monthSummary.notGenerated}
            tone="gray"
          />
          <MonthMetric
            label="Generated draft"
            value={data.monthSummary.generatedDraft}
            tone="emerald"
          />
          <MonthMetric
            label="Published"
            value={data.monthSummary.published}
            tone="green"
          />
          <MonthMetric
            label="Needs review"
            value={data.monthSummary.needsReview}
            tone="amber"
          />
          <MonthMetric
            label="Hard unmet"
            value={data.monthSummary.hardRequirementsUnmet}
            tone="red"
          />
          <MonthMetric
            label="Sundays"
            value={data.monthSummary.notScheduled}
            tone="gray"
          />
        </div>
      </section>

      <MonthScheduleActions
        date={data.range.monthStartDate}
        generatedDayCount={generatedDayCount}
        publishedDayCount={monthDays.filter((day) => day.status === "PUBLISHED").length}
        hardRequirementDayCount={data.monthSummary.hardRequirementsUnmet}
      />

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-950">Calendar export</h2>
        <p className="mt-1 text-sm text-slate-500">
          Download assignments for this displayed month. Published-only is the
          default.
        </p>
        <div className="mt-3">
          <ScheduleIcsExport
            startDate={data.range.monthStartDate}
            endDate={data.range.monthEndDate}
            rangeLabel="month"
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

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-950">Status legend</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Legend tone="gray" label="Not generated / Sunday" />
          <Legend tone="blue" label="Generated" />
          <Legend tone="emerald" label="Generated draft" />
          <Legend tone="green" label="Published" />
          <Legend tone="amber" label="Needs review" />
          <Legend tone="red" label="Hard requirements unmet" />
        </div>
      </section>

      <section className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="min-w-[1060px]">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold uppercase text-slate-600">
            {weekdayLabels.map((label) => (
              <div
                key={label}
                className="border-r border-slate-200 px-2 py-2 last:border-r-0"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid">
            {data.weeks.map((week) => (
              <div
                key={week[0].date}
                className="grid grid-cols-7 border-b border-slate-200 last:border-b-0"
              >
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
  if (!day.inMonth) {
    return (
      <article className="min-h-56 border-r border-slate-200 bg-slate-50 p-3 text-slate-400 last:border-r-0">
        <span className="font-semibold">{dayNumber(day.date)}</span>
      </article>
    );
  }

  return (
    <Link
      href={`/schedule?date=${day.date}`}
      aria-label={`Open whole-day schedule for ${day.date}`}
      className={`${dayCardClassName(day.tone)} group min-h-56 border-r border-slate-200 p-3 transition hover:-translate-y-px hover:shadow-md last:border-r-0`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-lg font-semibold text-slate-950 group-hover:text-emerald-900">
            {dayNumber(day.date)}
          </div>
          <div className="mt-0.5 text-[11px] font-medium uppercase text-slate-500">
            {day.publishStatus.replaceAll("_", " ")}
          </div>
        </div>
        <span className={statusClassName(day.tone)}>{day.label}</span>
      </div>

      {day.displayStatus === "NOT_SCHEDULED" ? (
        <p className="mt-8 text-center text-sm text-slate-500">
          Sunday · no generation
        </p>
      ) : (
        <div className="mt-4 grid gap-2 text-xs text-slate-700">
          <CalendarMetric
            label="Shift blocks"
            value={day.shiftBlockCount}
          />
          <CalendarMetric
            label="Clinic filled / unfilled"
            value={`${day.filledClinicSlotCount} / ${day.unfilledClinicSlotCount}`}
          />
          <CalendarMetric
            label="Background slots"
            value={day.backgroundSlotCount}
          />
          <CalendarMetric
            label="Assignments"
            value={day.assignmentCount}
          />
          <CalendarMetric
            label="Required shortages"
            value={day.requiredShortageCount}
            alert={day.requiredShortageCount > 0}
          />
          <CalendarMetric
            label="Week hard requirements"
            value={day.hardRequirementCount}
            alert={day.hardRequirementCount > 0}
          />
          <CalendarMetric
            label="PTO / NPTO"
            value={`${day.ptoCount} / ${day.nptoCount}`}
          />
        </div>
      )}

      {day.needsReview ? (
        <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-rose-800">
          <AlertTriangle size={13} aria-hidden="true" />
          Open day for review
        </div>
      ) : null}
    </Link>
  );
}

function CalendarMetric({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string | number;
  alert?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <strong className={alert ? "text-rose-800" : "text-slate-950"}>
        {value}
      </strong>
    </div>
  );
}

function MonthMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: MonthDayTone;
}) {
  return (
    <div className={`${metricClassName(tone)} rounded-md px-3 py-3`}>
      <div className="text-xs font-semibold uppercase">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Legend({ tone, label }: { tone: MonthDayTone; label: string }) {
  return (
    <span className={`${statusClassName(tone)} inline-flex items-center`}>
      {label}
    </span>
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

function dayCardClassName(tone: MonthDayTone) {
  switch (tone) {
    case "red":
      return "bg-rose-50";
    case "amber":
      return "bg-amber-50";
    case "green":
      return "bg-emerald-50";
    case "emerald":
      return "bg-teal-50";
    case "blue":
      return "bg-sky-50";
    default:
      return "bg-white";
  }
}

function statusClassName(tone: MonthDayTone) {
  const base = "rounded-md px-2 py-1 text-[10px] font-semibold uppercase";

  switch (tone) {
    case "red":
      return `${base} bg-rose-100 text-rose-800`;
    case "amber":
      return `${base} bg-amber-100 text-amber-800`;
    case "green":
      return `${base} bg-emerald-100 text-emerald-800`;
    case "emerald":
      return `${base} bg-teal-100 text-teal-800`;
    case "blue":
      return `${base} bg-sky-100 text-sky-800`;
    default:
      return `${base} bg-slate-100 text-slate-600`;
  }
}

function metricClassName(tone: MonthDayTone) {
  switch (tone) {
    case "red":
      return "bg-rose-50 text-rose-800";
    case "amber":
      return "bg-amber-50 text-amber-800";
    case "green":
      return "bg-emerald-50 text-emerald-800";
    case "emerald":
      return "bg-teal-50 text-teal-800";
    case "blue":
      return "bg-sky-50 text-sky-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}
