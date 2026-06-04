import type { Prisma, TaskType } from "@prisma/client";
import {
  AlertTriangle,
  CalendarPlus,
  CalendarRange,
  CalendarX2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  UserCheck,
  Copy,
} from "lucide-react";
import Link from "next/link";
import {
  addTaskSlotAction,
  copyScheduleDayAssignmentsAction,
  generateScheduleAction,
  publishScheduleAction,
  setScheduleScenarioAction,
  unpublishScheduleAction,
} from "@/app/(app)/schedule/actions";
import { ShortNoticeBadge } from "@/components/ui/short-notice-badge";
import { BulkGenerationForm } from "@/components/schedule/bulk-generation-form";
import { ManualAssignmentForm } from "@/components/schedule/manual-assignment-form";
import { MultiShiftAssignmentForm } from "@/components/schedule/multi-shift-assignment-form";
import { backgroundTaskDisplayName } from "@/lib/background/display";
import type { ManualAssignmentWarningMatrix } from "@/lib/db/manual-assignment";
import { getSchedulePublishIssues } from "@/lib/schedule/publish-validation";
import { buildWholeDayShiftGroups } from "@/lib/schedule/views";
import {
  addDaysIsoDate,
  formatDisplayDate,
  todayIsoDate,
} from "@/lib/utils/date";
import { formatCompactMinuteRange, formatMinuteOfDay } from "@/lib/utils/time";

type ScheduleDayWithSlots = Prisma.ScheduleDayGetPayload<{
  include: {
    taskSlots: {
      include: {
        shiftBlock: true;
        taskType: { include: { skillRequirements: { include: { skill: true } } } };
        assignments: { include: { employee: true } };
      };
    };
    shiftBlocks: true;
    publishedBy: true;
  };
}>;

type ScheduleBoardProps = {
  date: string;
  scheduleDay: ScheduleDayWithSlots | null;
  employees: { id: string; fullName: string }[];
  taskTypes: Array<
    TaskType & {
      skillRequirements: { skill: { name: string } }[];
    }
  >;
  manualWarnings: ManualAssignmentWarningMatrix;
  legacySlotCount: number;
};

export function ScheduleBoard({
  date,
  scheduleDay,
  employees,
  taskTypes,
  manualWarnings,
  legacySlotCount,
}: ScheduleBoardProps) {
  const currentScenario = scheduleDay?.scenario ?? "ROUTINE";
  const unfilledCount =
    scheduleDay?.taskSlots.filter((slot) => slot.status !== "FILLED").length ?? 0;
  const shortageCount =
    scheduleDay?.taskSlots.filter((slot) => slot.status === "SHORTAGE").length ?? 0;
  const assignedCount =
    scheduleDay?.taskSlots.reduce(
      (count, slot) => count + slot.assignments.length,
      0,
    ) ?? 0;
  const publishIssues = scheduleDay ? getSchedulePublishIssues(scheduleDay) : [];
  const canPublish = Boolean(
    scheduleDay &&
      scheduleDay.status !== "PUBLISHED" &&
      publishIssues.length === 0,
  );
  const canUnpublish = scheduleDay?.status === "PUBLISHED";
  const previousDate = addDaysIsoDate(date, -1);
  const nextDate = addDaysIsoDate(date, 1);
  const defaultTaskTypeCount = taskTypes.filter(
    (taskType) =>
      !taskType.optional &&
      (currentScenario === "DOCTOR_OFF_REDUCED_STAFFING"
        ? taskType.defaultForReduced
        : currentScenario === "ROUTINE"
          ? taskType.defaultForRoutine
          : false),
  ).length;
  const shiftGroups = scheduleDay
    ? buildWholeDayShiftGroups({
        shiftBlocks: scheduleDay.shiftBlocks,
        taskSlots: scheduleDay.taskSlots,
      })
    : [];

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
              Whole-day staffing board
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Link
                href={`/schedule?date=${previousDate}`}
                className="inline-flex size-10 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
                aria-label="Previous day"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </Link>
              <Link
                href={`/schedule?date=${todayIsoDate()}`}
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Today
              </Link>
              <Link
                href={`/schedule/week?date=${date}`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                <CalendarRange size={16} aria-hidden="true" />
                Week
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
                ? `${formatEnumLabel(currentScenario)}: ${scheduleDay.status.toLowerCase()} schedule with ${assignedCount} assignments and ${unfilledCount} slots needing attention`
                : `${formatEnumLabel(currentScenario)} will create ${defaultTaskTypeCount} default slots for a new schedule day`}
            </p>
            {scheduleDay?.publishedAt ? (
              <p className="mt-1 text-xs text-slate-500">
                Published {scheduleDay.publishedAt.toLocaleString()} by{" "}
                {scheduleDay.publishedBy?.fullName ?? "a manager"}
              </p>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <form action={setScheduleScenarioAction} className="flex gap-2">
              <input type="hidden" name="date" value={date} />
              <select
                name="scenario"
                defaultValue={currentScenario}
                className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
                aria-label="Clinic scenario"
              >
                {scenarioOptions.map((scenario) => (
                  <option key={scenario} value={scenario}>
                    {formatEnumLabel(scenario)}
                  </option>
                ))}
              </select>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                <SlidersHorizontal size={16} aria-hidden="true" />
                Save
              </button>
            </form>
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
            <form action={generateScheduleAction}>
              <input type="hidden" name="date" value={date} />
              <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800">
                <RefreshCw size={16} aria-hidden="true" />
                Generate day
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
            <form action={unpublishScheduleAction}>
              <input type="hidden" name="date" value={date} />
              <button
                disabled={!canUnpublish}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                <CalendarX2 size={16} aria-hidden="true" />
                Unpublish
              </button>
            </form>
            <Link
              href="/api/exports/calendar/clinic"
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-emerald-200 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
            >
              <Download size={16} aria-hidden="true" />
              Export Calendar
            </Link>
          </div>
        </div>
        <div className="mt-4">
          <BulkGenerationForm date={date} />
        </div>
      </section>

      {scheduleDay?.status === "NEEDS_REGENERATION" ? (
        <section className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
          <div className="flex items-start gap-3">
            <RefreshCw size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold">Schedule needs regeneration</h2>
              <p className="mt-1">
                A future employee assignment was removed or invalidated. Generate a
                draft before publishing this date.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {legacySlotCount > 0 ? (
        <section className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          {legacySlotCount} archived legacy full-day slot
          {legacySlotCount === 1 ? " is" : "s are"} hidden from this shift-block
          board. Preparing or generating the date uses configured ShiftTemplates.
        </section>
      ) : null}

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

      {publishIssues.length > 0 && scheduleDay?.status !== "PUBLISHED" ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <h2 className="font-semibold">Not ready to publish</h2>
          <ul className="mt-2 grid gap-1">
            {publishIssues.slice(0, 8).map((issue, index) => (
              <li key={`${issue.code}:${index}`}>{issue.message}</li>
            ))}
          </ul>
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
              Generate the day to prepare shift blocks, task slots, and assignments.
            </p>
          </div>
        </section>
      ) : (
        <section className="grid gap-5">
          {scheduleDay.taskSlots.length > 0 ? (
            <details className="rounded-md border border-slate-200 bg-white shadow-sm">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">
                Assignment helpers
              </summary>
              <div className="grid gap-4 border-t border-slate-200 p-4">
                <MultiShiftAssignmentForm
                  employees={employees}
                  warningMatrix={manualWarnings}
                  slots={scheduleDay.taskSlots.map((slot) => ({
                    id: slot.id,
                    label: `${slot.shiftBlock.name}: ${backgroundTaskDisplayName({
                      name: slot.label ?? slot.taskType.name,
                      isBackground: slot.taskType.isBackground,
                    })}`,
                    startMinute: slot.startMinute ?? slot.shiftBlock.startMinute,
                    endMinute: slot.endMinute ?? slot.shiftBlock.endMinute,
                  }))}
                />
                <form
                  action={copyScheduleDayAssignmentsAction}
                  className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <input type="hidden" name="date" value={date} />
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Copy this day to
                    <input
                      type="date"
                      name="targetDate"
                      required
                      defaultValue={addDaysIsoDate(date, 7)}
                      className="h-10 rounded-md border border-slate-300 bg-white px-3"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    Override reason if warnings occur
                    <input
                      name="overrideReason"
                      className="h-10 rounded-md border border-slate-300 bg-white px-3"
                    />
                  </label>
                  <button className="inline-flex h-10 items-center gap-2 self-end rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                    <Copy size={16} aria-hidden="true" />
                    Copy day pattern
                  </button>
                </form>
              </div>
            </details>
          ) : null}
          {scheduleDay.taskSlots.length === 0 &&
          scheduleDay.shiftBlocks.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center lg:col-span-3">
              {currentScenario === "CLINIC_CLOSED" ? (
                <CalendarX2
                  className="mx-auto text-emerald-700"
                  size={28}
                  aria-hidden="true"
                />
              ) : (
                <CalendarPlus
                  className="mx-auto text-emerald-700"
                  size={28}
                  aria-hidden="true"
                />
              )}
              <h2 className="mt-3 text-xl font-semibold text-slate-950">
                {currentScenario === "CLINIC_CLOSED"
                  ? "Clinic closed"
                  : "No task slots configured"}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                {currentScenario === "CLINIC_CLOSED"
                  ? "This date will not create routine staffing slots."
                  : "Generate the day to prepare configured shifts and staffing roles."}
              </p>
            </div>
          ) : null}
          {shiftGroups.map((group) => (
            <div
              key={group.shiftBlock.id}
              className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h2 className="font-mono text-xl font-semibold text-slate-950">
                      {formatCompactMinuteRange(
                        group.shiftBlock.startMinute,
                        group.shiftBlock.endMinute,
                      )}
                    </h2>
                    <span className="text-sm font-semibold text-slate-700">
                      {group.shiftBlock.name}
                    </span>
                    <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                      {formatEnumLabel(group.shiftBlock.shiftCategory)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatMinuteOfDay(group.shiftBlock.startMinute)} to{" "}
                    {formatMinuteOfDay(group.shiftBlock.endMinute)} /{" "}
                    {Number(group.shiftBlock.paidHours)} paid hours /{" "}
                    {group.slots.length} roles
                  </p>
                </div>
                {group.shiftBlock.defaultForSchedule ? (
                  <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">
                    Default
                  </span>
                ) : null}
              </div>
              <ShiftAddSlotForm
                date={date}
                shiftBlockId={group.shiftBlock.id}
                taskTypes={taskTypes}
              />
              <div className="divide-y divide-slate-200">
                {group.slots.length > 0 ? (
                  group.slots.map((slot) => (
                    <ScheduleSlotCard
                      key={slot.id}
                      slot={slot}
                      employees={employees}
                      warningsByEmployee={manualWarnings[slot.id]}
                    />
                  ))
                ) : (
                  <p className="bg-white px-4 py-5 text-sm text-slate-500">
                    No roles configured for this shift.
                  </p>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function ShiftAddSlotForm({
  date,
  shiftBlockId,
  taskTypes,
}: {
  date: string;
  shiftBlockId: string;
  taskTypes: ScheduleBoardProps["taskTypes"];
}) {
  return (
    <form
      action={addTaskSlotAction}
      className="flex flex-col gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row"
    >
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="shiftBlockId" value={shiftBlockId} />
      <select
        name="taskTypeId"
        defaultValue=""
        required
        className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
      >
        <option value="">Add a role to this shift</option>
        {taskTypes.map((taskType) => (
          <option key={taskType.id} value={taskType.id}>
            {taskType.name}
            {taskType.optional ? " (optional)" : ""}
          </option>
        ))}
      </select>
      <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
        <Plus size={16} aria-hidden="true" />
        Add role
      </button>
    </form>
  );
}

function ScheduleSlotCard({
  slot,
  employees,
  warningsByEmployee,
}: {
  slot: ScheduleDayWithSlots["taskSlots"][number];
  employees: { id: string; fullName: string }[];
  warningsByEmployee: ManualAssignmentWarningMatrix[string] | undefined;
}) {
  const currentAssignment = slot.assignments[0];
  const requiredSkills = slot.taskType.skillRequirements.map(
    (requirement) => requirement.skill.name,
  );

  return (
    <article
      className={
        slot.status === "SHORTAGE"
          ? "grid gap-4 bg-amber-50/50 p-4 lg:grid-cols-[minmax(190px,1.1fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(220px,1.2fr)]"
          : "grid gap-4 bg-white p-4 lg:grid-cols-[minmax(190px,1.1fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(220px,1.2fr)]"
      }
    >
      <div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-950">
              {backgroundTaskDisplayName({
                name: slot.label ?? slot.taskType.name,
                isBackground: slot.taskType.isBackground,
              })}
            </h3>
            {slot.shortNotice ? <ShortNoticeBadge /> : null}
            <span className={requirementLevelClassName(slot.requirementLevel)}>
              {formatEnumLabel(slot.requirementLevel)}
            </span>
            <span className={taskClassName(slot.taskType)}>
              {taskClassLabel(slot.taskType)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Slot #{slot.slotIndex} / {formatEnumLabel(slot.source)}
          </p>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase text-slate-500">Assigned</div>
        {slot.assignments.length ? (
          <div className="mt-2 grid gap-2">
            {slot.assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="grid gap-1 text-sm font-semibold text-slate-900"
              >
                <span className="inline-flex items-center gap-2">
                  <UserCheck size={16} aria-hidden="true" />
                  {assignment.employee.fullName}
                </span>
                <span className="w-fit rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                  {assignment.locked ? "Locked" : assignment.source}
                </span>
                {assignment.shortNotice ? (
                  <ShortNoticeBadge label="Short notice override" />
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertTriangle size={16} aria-hidden="true" />
            Unfilled
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">
          {slot.assignments.length} of {slot.requiredStaff}{" "}
          {slot.requirementLevel === "REQUIRED" ? "required" : "target"} staff
          assigned
        </p>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              slot.status === "FILLED"
                ? "rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
                : "rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900"
            }
          >
            {slot.status}
          </span>
          {requiredSkills.length ? (
            requiredSkills.map((skill) => (
              <span
                key={skill}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
              >
                {skill}
              </span>
            ))
          ) : (
            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
              General access
            </span>
          )}
        </div>
        {slot.notes ? (
          <div
            className={
              slot.status === "SHORTAGE"
                ? "mt-3 border-l-2 border-amber-400 pl-3 text-xs text-amber-900"
                : "mt-3 border-l-2 border-slate-300 pl-3 text-xs text-slate-600"
            }
          >
            {slot.notes}
          </div>
        ) : null}
      </div>

      <div>
        <ManualAssignmentForm
          slotId={slot.id}
          currentEmployeeId={currentAssignment?.employeeId}
          employees={employees}
          warningsByEmployee={warningsByEmployee}
        />
      </div>
    </article>
  );
}

const scenarioOptions = [
  "ROUTINE",
  "CLINIC_CLOSED",
  "DOCTOR_OFF_REDUCED_STAFFING",
  "CUSTOM",
] as const;

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function requirementLevelClassName(value: string) {
  switch (value) {
    case "REQUIRED":
      return "rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700";
    case "DESIRED":
      return "rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700";
    case "CONDITIONAL":
      return "rounded-md bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700";
    default:
      return "rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600";
  }
}

function taskClassLabel(taskType: {
  isPatientFacing: boolean;
  isBackground: boolean;
  isFloat: boolean;
  isEndoscopy: boolean;
}) {
  if (taskType.isBackground) return "Background";
  if (taskType.isFloat) return "Float";
  if (taskType.isEndoscopy) return "Endoscopy";
  if (taskType.isPatientFacing) return "Clinic";
  return "Support";
}

function taskClassName(taskType: {
  isPatientFacing: boolean;
  isBackground: boolean;
  isFloat: boolean;
  isEndoscopy: boolean;
}) {
  const label = taskClassLabel(taskType);

  if (label === "Clinic") {
    return "rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800";
  }

  if (label === "Background") {
    return "rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800";
  }

  if (label === "Float") {
    return "rounded-md bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-800";
  }

  return "rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700";
}
