import type { Employee, ShiftTemplate } from "@prisma/client";
import { CircleOff } from "lucide-react";
import { deactivateShiftTemplateAction } from "@/app/(app)/admin/shifts/actions";
import { ShiftTemplateForm } from "@/components/admin/shift-template-form";
import { formatDisplayDate } from "@/lib/utils/date";
import { formatMinuteOfDay } from "@/lib/utils/time";

type ShiftTemplateRecord = ShiftTemplate & {
  createdBy: Employee | null;
  _count: {
    shiftBlocks: number;
    staffingRules: number;
  };
};

export function ShiftTemplateList({
  templates,
}: {
  templates: ShiftTemplateRecord[];
}) {
  if (templates.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No shift templates yet. Seed data adds the spreadsheet defaults, and
        managers can add or adjust them here.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {templates.map((template) => (
        <details
          key={template.id}
          className="rounded-md border border-slate-200 bg-white shadow-sm"
        >
          <summary className="grid cursor-pointer gap-3 px-4 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-950">
                  {template.name}
                </span>
                <span
                  className={
                    template.active
                      ? "rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
                      : "rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600"
                  }
                >
                  {template.active ? "ACTIVE" : "INACTIVE"}
                </span>
                {template.defaultForSchedule ? (
                  <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">
                    default
                  </span>
                ) : null}
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                  {formatEnumLabel(template.shiftCategory)}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {formatWeekday(template.dayOfWeek)} /{" "}
                {formatMinuteOfDay(template.startMinute)}-
                {formatMinuteOfDay(template.endMinute)} /{" "}
                {Number(template.paidHours)} paid hours
              </p>
              {template.notes ? (
                <p className="mt-2 text-sm text-slate-600">{template.notes}</p>
              ) : null}
            </div>
            <div className="text-sm text-slate-500">
              <div>{formatTemplateDates(template)}</div>
              <div>
                {template._count.staffingRules} staffing rules /{" "}
                {template._count.shiftBlocks} dated blocks
              </div>
            </div>
          </summary>
          <div className="grid gap-4 border-t border-slate-200 p-4">
            <ShiftTemplateForm template={template} />
            {template.active ? (
              <form action={deactivateShiftTemplateAction.bind(null, template.id)}>
                <button className="inline-flex h-10 items-center gap-2 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50">
                  <CircleOff size={16} aria-hidden="true" />
                  Deactivate shift template
                </button>
              </form>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
}

function formatTemplateDates(template: ShiftTemplateRecord) {
  if (!template.effectiveStartDate && !template.effectiveEndDate) {
    return "Always active";
  }

  return `${template.effectiveStartDate ? formatDisplayDate(template.effectiveStartDate) : "Any start"} - ${template.effectiveEndDate ? formatDisplayDate(template.effectiveEndDate) : "Any end"}`;
}

function formatWeekday(weekday: number | null) {
  if (weekday === null) {
    return "Weekdays";
  }

  return [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][weekday];
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
