import type { Employee, Prisma, TaskType } from "@prisma/client";
import { AlertTriangle, CalendarPlus, RefreshCw, UserCheck } from "lucide-react";
import {
  createScheduleDayAction,
  generateScheduleAction,
  manualAssignAction,
} from "@/app/(app)/schedule/actions";
import { formatDisplayDate } from "@/lib/utils/date";

type ScheduleDayWithSlots = Prisma.ScheduleDayGetPayload<{
  include: {
    taskSlots: {
      include: {
        taskType: { include: { skillRequirements: { include: { skill: true } } } };
        assignments: { include: { employee: true } };
      };
    };
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

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
              Daily staffing board
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-950">
              {formatDisplayDate(date)}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {scheduleDay
                ? `${scheduleDay.taskSlots.length} task slots, ${unfilledCount} needing attention`
                : `${taskTypes.length} configured task types ready for slot creation`}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
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
                Create slots
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
                Generate
              </button>
            </form>
          </div>
        </div>
      </section>

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
                className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
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
                  {currentAssignment ? (
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <UserCheck size={16} aria-hidden="true" />
                      {currentAssignment.employee.fullName}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                      <AlertTriangle size={16} aria-hidden="true" />
                      Unfilled
                    </div>
                  )}
                  {currentAssignment?.locked ? (
                    <p className="mt-1 text-xs text-slate-500">Manual override locked</p>
                  ) : null}
                </div>

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
