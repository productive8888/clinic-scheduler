import type { ClinicScenario } from "@prisma/client";
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck2,
  ClipboardList,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { ShortNoticeBadge } from "@/components/ui/short-notice-badge";
import type { getStaffingAnalyticsPageData } from "@/lib/db/analytics";
import { formatDisplayDate } from "@/lib/utils/date";

type StaffingAnalyticsData = Awaited<ReturnType<typeof getStaffingAnalyticsPageData>>;

type StaffingAnalyticsDashboardProps = {
  data: StaffingAnalyticsData;
};

const scenarioOptions: ClinicScenario[] = [
  "ROUTINE",
  "CLINIC_CLOSED",
  "DOCTOR_OFF_REDUCED_STAFFING",
  "CUSTOM",
];

export function StaffingAnalyticsDashboard({
  data,
}: StaffingAnalyticsDashboardProps) {
  const { filters, analytics } = data;

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
          Staffing analytics
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          Staffing health and workload audit
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Review date-level coverage, workload balance, role distribution, and
          short-notice changes.
        </p>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <form
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto_auto]"
          action="/admin/analytics"
        >
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Start date
            <input
              name="startDate"
              type="date"
              defaultValue={filters.startDate}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            End date
            <input
              name="endDate"
              type="date"
              defaultValue={filters.endDate}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Employee
            <select
              name="employeeId"
              defaultValue={filters.employeeId}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
            >
              <option value="">All employees</option>
              {data.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Task type
            <select
              name="taskTypeId"
              defaultValue={filters.taskTypeId}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
            >
              <option value="">All task types</option>
              {data.taskTypes.map((taskType) => (
                <option key={taskType.id} value={taskType.id}>
                  {taskType.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Scenario
            <select
              name="scenario"
              defaultValue={filters.scenario}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
            >
              <option value="">All scenarios</option>
              {scenarioOptions.map((scenario) => (
                <option key={scenario} value={scenario}>
                  {formatEnumLabel(scenario)}
                </option>
              ))}
            </select>
          </label>
          <button className="h-10 self-end rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
            Filter
          </button>
          <Link
            href="/admin/analytics"
            className="inline-flex h-10 items-center justify-center self-end rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Clear
          </Link>
        </form>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={ClipboardList}
          label="Task slots"
          value={analytics.summary.requiredTaskSlots.toString()}
        />
        <MetricCard
          icon={UserRound}
          label="Filled assignments"
          value={analytics.summary.filledAssignments.toString()}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Shortages"
          value={analytics.summary.shortageConflictCount.toString()}
        />
        <MetricCard
          icon={CalendarCheck2}
          label="PTO requests"
          value={analytics.summary.ptoCount.toString()}
        />
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">
            Date-level staffing health
          </h2>
          {analytics.summary.shortNoticeCount > 0 ? (
            <ShortNoticeBadge label={`${analytics.summary.shortNoticeCount} short notice`} />
          ) : null}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs uppercase tracking-normal text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Scenario</th>
                <th className="px-3 py-2">Required slots</th>
                <th className="px-3 py-2">Filled</th>
                <th className="px-3 py-2">Unfilled</th>
                <th className="px-3 py-2">PTO</th>
                <th className="px-3 py-2">Shortages</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Flags</th>
              </tr>
            </thead>
            <tbody>
              {analytics.dateHealth.map((day) => (
                <tr key={day.date} className="bg-slate-50">
                  <td className="rounded-l-md px-3 py-3 font-medium text-slate-950">
                    {formatDisplayDate(day.date)}
                  </td>
                  <td className="px-3 py-3">{formatEnumLabel(day.scenario)}</td>
                  <td className="px-3 py-3">{day.requiredTaskSlots}</td>
                  <td className="px-3 py-3">{day.filledAssignments}</td>
                  <td className="px-3 py-3">{day.unfilledSlots}</td>
                  <td className="px-3 py-3">{day.ptoCount}</td>
                  <td className="px-3 py-3">{day.shortageConflictCount}</td>
                  <td className="px-3 py-3">{formatEnumLabel(day.status)}</td>
                  <td className="rounded-r-md px-3 py-3">
                    {day.shortNoticeCount > 0 ? (
                      <ShortNoticeBadge label={`${day.shortNoticeCount}`} />
                    ) : (
                      <span className="text-slate-400">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {analytics.dateHealth.length === 0 ? <EmptyState /> : null}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Employee workload">
          <div className="grid gap-3">
            {analytics.employeeWorkloads.map((employee) => (
              <div
                key={employee.employeeId}
                className="rounded-md border border-slate-200 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-950">
                    {employee.fullName}
                  </h3>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                    {employee.assignmentCount} assignments
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {employee.ptoCount} PTO requests /{" "}
                  {employee.difficultOrSkilledCount} difficult or skilled roles
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {employee.taskCounts.length ? (
                    employee.taskCounts.map((task) => (
                      <span
                        key={task.taskTypeId}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600"
                      >
                        {task.taskTypeName}: {task.count}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-400">No assignments</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Role leaders">
          <div className="grid gap-2">
            {analytics.roleLeaders.map((leader) => (
              <div
                key={leader.taskTypeId}
                className="flex items-center justify-between gap-3 rounded-md bg-slate-50 p-3 text-sm"
              >
                <span className="font-medium text-slate-950">
                  {leader.taskTypeName}
                </span>
                <span className="text-right text-slate-600">
                  {leader.fullName ? `${leader.fullName} (${leader.count})` : "None"}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <Panel title="Task-level analytics">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs uppercase tracking-normal text-slate-500">
              <tr>
                <th className="px-3 py-2">Task type</th>
                <th className="px-3 py-2">Frequency</th>
                <th className="px-3 py-2">Understaffed</th>
                <th className="px-3 py-2">Overrides</th>
                <th className="px-3 py-2">Short-notice changes</th>
              </tr>
            </thead>
            <tbody>
              {analytics.taskTypeStats.map((task) => (
                <tr key={task.taskTypeId} className="bg-slate-50">
                  <td className="rounded-l-md px-3 py-3 font-medium text-slate-950">
                    {task.taskTypeName}
                  </td>
                  <td className="px-3 py-3">{task.frequency}</td>
                  <td className="px-3 py-3">{task.understaffedCount}</td>
                  <td className="px-3 py-3">{task.overrideCount}</td>
                  <td className="rounded-r-md px-3 py-3">
                    {task.shortNoticeChangeCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <Icon className="text-emerald-700" size={22} aria-hidden="true" />
      <h2 className="mt-3 text-sm font-semibold text-slate-500">{label}</h2>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
      No staffing data matches the selected filters.
    </div>
  );
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
