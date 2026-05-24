import type { Employee, Prisma, TaskType } from "@prisma/client";
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import {
  createScheduleDayAction,
  generateScheduleAction,
  manualAssignAction,
  publishScheduleAction,
} from "@/app/(app)/schedule/actions";
import { addDaysIsoDate, formatDisplayDate } from "@/lib/utils/date";

type ScheduleDayWithSlots = Prisma.ScheduleDayGetPayload<{
  include: {
    taskSlots: {
      include: {
        taskType: { include: { skillRequirements: { include: { skill: true } } } };
        assignments: { include: { employee: true } };
      };
    };
    publishedBy: true;
  };
}>;

type ScheduleBoardProps = {
  date: string;
  scheduleDay: ScheduleDayWithSlots | null;
  employees: Employee[];
  taskTypes: Array<
    TaskType & {
      skillRequirements: { skill: { name: string } }[];
    }
  >;
};

export function ScheduleBoard({
  date,
  scheduleDay,
  employees,
  taskTypes,
}: ScheduleBoardProps) {
  const unfilledCount =
    scheduleDay?.taskSlots.filter((slot) => slot.status !== "FILLED").length ?? 0;
  const shortageCount =
    scheduleDay?.taskSlots.filter((slot) => slot.status === "SHORTAGE").length ?? 0;
  const assignedCount =
    scheduleDay?.taskSlots.reduce(
      (count, slot) => count + slot.assignments.length,
      0,
    ) ?? 0;
  const canPublish = Boolean(
    scheduleDay &&
      scheduleDay.status !== "PUBLISHED" &&
      shortageCount === 0 &&
      assignedCount > 0,
  );
  const previousDate = addDaysIsoDate(date, -1);
  const nextDate = addDaysIsoDate(date, 1);

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
              Daily staffing board
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Link
                href={`/schedule?date=${previousDate}`}
                className="inline-flex size-10 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
                aria-label="Previous day"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </Link>
              <h1 className="text-3xl font-semibold text-slate-950">
                {formatDisplayDate(date)}
              </h1>
              <Link
                href={`/schedule?date=${nextDate}`}
                className="inline-flex size-10 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
                aria-label="Next day"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {scheduleDay
                ? `${scheduleDay.status.toLowerCase()} schedule: ${assignedCount} assignments, ${unfilledCount} slots needing attention`
                : `${taskTypes.length} task types are configured for a new schedule day`}
            </p>
            {scheduleDay?.publishedAt ? (
              <p className="mt-1 text-xs text-slate-500">
                Published {scheduleDay.publishedAt.toLocaleString()} by{" "}
                {scheduleDay.publishedBy?.fullName ?? "a manager"}
              </p>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <form className="flex gap-2" action="/schedule">
              <input
                name="date"
                type="date"
                defaultValue={date}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
              />
              <button className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                Go
              </button>
            </form>
            <form action={createScheduleDayAction}>
              <input type="hidden" name="date" value={date} />
              <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-emerald-200 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">
                <CalendarPlus size={16} aria-hidden="true" />
                Prepare slots
              </button>
            </form>
            <form action={generateScheduleAction} className="flex gap-2">
              <input type="hidden" name="date" value={date} />
              <input
                name="seed"
                defaultValue={`clinic-${date}`}
                className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 font-mono text-xs outline-none focus:border-emerald-700"
                aria-label="Generation seed"
              />
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800">
                <RefreshCw size={16} aria-hidden="true" />
                Generate draft
              </button>
            </form>
            <form action={publishScheduleAction}>
              <input type="hidden" name="date" value={date} />
              <button
                disabled={!canPublish}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                Publish
              </button>
            </form>
          </div>
        </div>
        <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 text-sm text-slate-600 md:grid-cols-3">
          <div>
            <span className="font-semibold text-slate-900">Prepare slots</span> creates
            one dated opening for each active task type.
          </div>
          <div>
            <span className="font-semibold text-slate-900">Generate draft</span> fills
            unlocked slots from skills, availability, PTO, rules, and fairness.
          </div>
          <div>
            <span className="font-semibold text-slate-900">Publish</span> finalizes the
            reviewed schedule once shortages are resolved.
          </div>
        </div>
      </section>

      {shortageCount > 0 ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold">{shortageCount} shortage/conflict slots</h2>
              <p className="mt-1">
                Review the highlighted slots below. You can assign a compatible employee
                manually; manual assignments are locked and preserved on regeneration.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {!scheduleDay ? (
        <section className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="mx-auto flex max-w-md flex-col items-center gap-3">
            <CalendarPlus className="text-emerald-700" size={28} aria-hidden="true" />
            <h2 className="text-xl font-semibold text-slate-950">
              No staffing board for this date
            </h2>
            <p className="text-sm text-slate-500">
              Create the default slots, then generate assignments or fill roles manually.
            </p>
          </div>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-3">
          {scheduleDay.taskSlots.map((slot) => {
            const currentAssignment = slot.assignments[0];
            const requiredSkills = slot.taskType.skillRequirements.map(
              (requirement) => requirement.skill.name,
            );

            return (
              <article
                key={slot.id}
                className={
                  slot.status === "SHORTAGE"
                    ? "rounded-md border border-amber-300 bg-white p-4 shadow-sm ring-2 ring-amber-100"
                    : "rounded-md border border-slate-200 bg-white p-4 shadow-sm"
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">
                      {slot.label ?? slot.taskType.name}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Slot #{slot.slotIndex}
                    </p>
                  </div>
                  <span
                    className={
                      slot.status === "FILLED"
                        ? "rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
                        : "rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"
                    }
                  >
                    {slot.status}
                  </span>
                </div>

                <div className="mt-4 rounded-md bg-slate-50 p-3">
                  {slot.assignments.length ? (
                    <div className="grid gap-2">
                      {slot.assignments.map((assignment) => (
                        <div
                          key={assignment.id}
                          className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-900"
                        >
                          <span className="inline-flex items-center gap-2">
                            <UserCheck size={16} aria-hidden="true" />
                            {assignment.employee.fullName}
                          </span>
                          <span className="rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-600">
                            {assignment.locked ? "Locked" : assignment.source}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                      <AlertTriangle size={16} aria-hidden="true" />
                      Unfilled
                    </div>
                  )}
                  <p className="mt-2 text-xs text-slate-500">
                    {slot.assignments.length} of {slot.requiredStaff} required staff
                    assigned
                  </p>
                </div>

                {slot.status === "SHORTAGE" && slot.notes ? (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    {slot.notes}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  {requiredSkills.length ? (
                    requiredSkills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600"
                      >
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600">
                      General access
                    </span>
                  )}
                </div>

                <form action={manualAssignAction.bind(null, slot.id)} className="mt-4 flex gap-2">
                  <select
                    name="employeeId"
                    defaultValue={currentAssignment?.employeeId ?? ""}
                    className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
                  >
                    <option value="">Unassigned</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.fullName}
                      </option>
                    ))}
                  </select>
                  <button className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                    Save
                  </button>
                </form>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
