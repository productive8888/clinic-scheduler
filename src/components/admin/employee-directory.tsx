import type {
  Employee,
  EmployeeSkill,
  Skill,
  WeeklyAvailability,
  WorkPattern,
} from "@prisma/client";
import { CalendarClock, CircleOff, Pencil, Trash2 } from "lucide-react";
import {
  deactivateEmployeeAction,
  deleteEmployeeAction,
} from "@/app/(app)/admin/employees/actions";
import {
  formatMinuteRange,
  weekdayShortLabel,
  WEEKDAYS,
} from "@/lib/availability";
import { EmployeeForm } from "./employee-form";

type EmployeeRecord = Employee & {
  skills: Array<EmployeeSkill & { skill: Skill }>;
  availability: WeeklyAvailability[];
  workPattern: WorkPattern | null;
};

export function EmployeeDirectory({
  employees,
  skills,
  workPatterns,
}: {
  employees: EmployeeRecord[];
  skills: Skill[];
  workPatterns: WorkPattern[];
}) {
  if (employees.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No employees yet. Create the first profile to start staffing schedules.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {employees.map((employee) => (
        <details
          key={employee.id}
          className="rounded-md border border-slate-200 bg-white shadow-sm"
        >
          <summary className="grid cursor-pointer gap-3 px-4 py-4 md:grid-cols-[1fr_auto_auto] md:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-slate-950">
                  {employee.fullName}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                  {employee.role}
                </span>
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                  {employee.status}
                </span>
              </div>
              <div className="mt-1 text-sm text-slate-500">{employee.email}</div>
              {employee.workPattern ? (
                <div className="mt-1 text-xs font-medium text-emerald-800">
                  {employee.workPattern.name}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              {employee.skills.length ? (
                employee.skills.map(({ skill }) => (
                  <span
                    key={skill.id}
                    className="rounded-md border border-slate-200 px-2 py-1"
                  >
                    {skill.name}
                  </span>
                ))
              ) : (
                <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
                  No skills
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span>{employee.expectedWeeklyHours.toString()} hrs/week</span>
              <span className="inline-flex items-center gap-1">
                <CalendarClock size={16} aria-hidden="true" />
                {formatAvailabilitySummary(employee.availability)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Pencil size={16} aria-hidden="true" />
                Edit
              </span>
            </div>
          </summary>
          <div className="border-t border-slate-200 p-4">
            <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-950">
                Normal weekly schedule
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {WEEKDAYS.map((day) => {
                  const windows = employee.availability.filter(
                    (window) => window.weekday === day.value,
                  );

                  return (
                    <div
                      key={day.value}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <div className="font-medium text-slate-950">
                        {day.label}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {windows.length
                          ? windows
                              .map((window) =>
                                formatMinuteRange(
                                  window.startMinute,
                                  window.endMinute,
                                ),
                              )
                              .join(", ")
                          : "Unavailable"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <EmployeeForm
              employee={employee}
              skills={skills}
              workPatterns={workPatterns}
            />
            {employee.status === "ACTIVE" ? (
              <form action={deactivateEmployeeAction.bind(null, employee.id)}>
                <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50">
                  <CircleOff size={16} aria-hidden="true" />
                  Deactivate employee
                </button>
              </form>
            ) : null}
            <form action={deleteEmployeeAction.bind(null, employee.id)}>
              <button className="mt-3 inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                <Trash2 size={16} aria-hidden="true" />
                Delete if unused
              </button>
            </form>
          </div>
        </details>
      ))}
    </div>
  );
}

function formatAvailabilitySummary(availability: WeeklyAvailability[]) {
  if (availability.length === 0) {
    return "No normal hours";
  }

  return availability
    .map(
      (window) =>
        `${weekdayShortLabel(window.weekday)} ${formatMinuteRange(
          window.startMinute,
          window.endMinute,
        )}`,
    )
    .join(", ");
}
