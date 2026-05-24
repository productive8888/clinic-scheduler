import {
  CalendarClock,
  CalendarX,
  CheckCircle2,
  Clock,
  IdCard,
  ShieldCheck,
} from "lucide-react";
import { createMyPtoRequestAction } from "@/app/(app)/employee/actions";
import { PTORequestForm } from "@/components/pto/pto-request-form";
import { PTORequestList } from "@/components/pto/pto-request-list";
import type { getEmployeePortalData } from "@/lib/db/employee-portal";
import { formatDisplayDate, toIsoDate } from "@/lib/utils/date";
import { formatMinuteOfDay } from "@/lib/utils/time";

type EmployeePortalData = Awaited<ReturnType<typeof getEmployeePortalData>>;

type EmployeePortalDashboardProps = {
  data: EmployeePortalData;
};

const weekdayLabels = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function EmployeePortalDashboard({ data }: EmployeePortalDashboardProps) {
  const { employee, assignments, ptoRequests } = data;

  if (!employee) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No employee profile is linked to this account yet.
      </div>
    );
  }

  const pendingPtoCount = ptoRequests.filter(
    (request) => request.status === "PENDING",
  ).length;
  const assignmentsByDate = groupAssignmentsByDate(assignments);

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
          Employee portal
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          {employee.fullName}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          View upcoming work, PTO status, skills, and recurring availability.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={IdCard}
          label="Email"
          value={employee.email}
        />
        <MetricCard
          icon={ShieldCheck}
          label="Role"
          value={formatEnumLabel(employee.role)}
        />
        <MetricCard
          icon={CalendarClock}
          label="Upcoming assignments"
          value={assignments.length.toString()}
        />
        <MetricCard
          icon={CalendarX}
          label="PTO balance"
          value={`${employee.ptoBalanceHours.toString()} hours`}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">
              Upcoming schedule
            </h2>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
              Generated and published days
            </span>
          </div>

          <div className="mt-4 grid gap-4">
            {assignmentsByDate.length ? (
              assignmentsByDate.map(([date, dateAssignments]) => (
                <div key={date} className="rounded-md border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-slate-950">
                      {formatDisplayDate(date)}
                    </h3>
                    <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                      {dateAssignments[0]?.taskSlot.scheduleDay.status}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {dateAssignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="flex flex-col gap-2 rounded-md bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-medium text-slate-950">
                            {assignment.taskSlot.taskType.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatTimeRange(
                              assignment.taskSlot.startMinute,
                              assignment.taskSlot.endMinute,
                            )}
                          </p>
                        </div>
                        <span className="w-fit rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-600">
                          {assignment.locked ? "Manual override" : assignment.source}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                No upcoming generated or published assignments are linked to this
                profile yet.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-6">
          <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Skills</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {employee.skills.length ? (
                employee.skills.map(({ skill }) => (
                  <span
                    key={skill.id}
                    className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700"
                  >
                    {skill.name}
                  </span>
                ))
              ) : (
                <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-sm text-amber-800">
                  No skills assigned
                </span>
              )}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">
              Recurring availability
            </h2>
            <div className="mt-4 grid gap-2">
              {employee.availability.length ? (
                employee.availability.map((window) => (
                  <div
                    key={window.id}
                    className="flex items-center justify-between gap-3 rounded-md bg-slate-50 p-3 text-sm"
                  >
                    <span className="font-medium text-slate-950">
                      {weekdayLabels[window.weekday]}
                    </span>
                    <span className="inline-flex items-center gap-2 text-slate-600">
                      <Clock size={14} aria-hidden="true" />
                      {formatTimeRange(window.startMinute, window.endMinute)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  No recurring availability is configured.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">
            Request time off or unavailability
          </h2>
          <span className="inline-flex items-center gap-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
            <CheckCircle2 size={14} aria-hidden="true" />
            {pendingPtoCount} pending
          </span>
        </div>
        <div className="mt-4">
          <PTORequestForm action={createMyPtoRequestAction} />
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold text-slate-950">
          PTO request status
        </h2>
        <PTORequestList requests={ptoRequests} mode="employee" />
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof IdCard;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <Icon className="text-emerald-700" size={22} aria-hidden="true" />
      <h2 className="mt-3 text-sm font-semibold text-slate-500">{label}</h2>
      <p className="mt-1 break-words font-medium text-slate-950">{value}</p>
    </div>
  );
}

function groupAssignmentsByDate(
  assignments: EmployeePortalData["assignments"],
) {
  const byDate = new Map<string, EmployeePortalData["assignments"]>();

  for (const assignment of assignments) {
    const date = toIsoDate(assignment.taskSlot.scheduleDay.date);
    const existing = byDate.get(date) ?? [];

    existing.push(assignment);
    byDate.set(date, existing);
  }

  return [...byDate.entries()];
}

function formatTimeRange(
  startMinute: number | null | undefined,
  endMinute: number | null | undefined,
) {
  const start = formatMinuteOfDay(startMinute);
  const end = formatMinuteOfDay(endMinute);

  return start && end ? `${start}-${end}` : "All day";
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
