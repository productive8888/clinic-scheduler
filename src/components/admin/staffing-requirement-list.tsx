import type { Employee, StaffingRequirementRule, TaskType } from "@prisma/client";
import { CircleOff } from "lucide-react";
import { deactivateStaffingRequirementRuleAction } from "@/app/(app)/admin/staffing/actions";
import { StaffingRequirementForm } from "@/components/admin/staffing-requirement-form";
import { formatDisplayDate } from "@/lib/utils/date";

type StaffingRuleRecord = StaffingRequirementRule & {
  taskType: TaskType;
  createdBy: Employee | null;
};

type StaffingRuleTaskType = Pick<TaskType, "id" | "name" | "code" | "optional">;

export function StaffingRequirementList({
  rules,
  taskTypes,
}: {
  rules: StaffingRuleRecord[];
  taskTypes: StaffingRuleTaskType[];
}) {
  if (rules.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No staffing requirement rules yet. Safe defaults will create one required
        slot for each routine default task type.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {rules.map((rule) => (
        <details
          key={rule.id}
          className="rounded-md border border-slate-200 bg-white shadow-sm"
        >
          <summary className="grid cursor-pointer gap-3 px-4 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-950">
                  {rule.taskType.name}
                </span>
                <span
                  className={
                    rule.active
                      ? "rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
                      : "rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600"
                  }
                >
                  {rule.active ? "ACTIVE" : "INACTIVE"}
                </span>
                <span className="rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                  min {rule.minRequiredSlots}
                </span>
                <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">
                  desired {rule.desiredSlots}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                  max {rule.maxSlots}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {formatWeekday(rule.weekday)} /{" "}
                {rule.scenario ? formatEnumLabel(rule.scenario) : "Any scenario"} /{" "}
                extra slots {formatEnumLabel(rule.requirementLevel)}
              </p>
              {rule.notes ? (
                <p className="mt-2 text-sm text-slate-600">{rule.notes}</p>
              ) : null}
            </div>
            <div className="text-sm text-slate-500">{formatRuleDates(rule)}</div>
          </summary>
          <div className="grid gap-4 border-t border-slate-200 p-4">
            <StaffingRequirementForm rule={rule} taskTypes={taskTypes} />
            {rule.active ? (
              <form action={deactivateStaffingRequirementRuleAction.bind(null, rule.id)}>
                <button className="inline-flex h-10 items-center gap-2 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50">
                  <CircleOff size={16} aria-hidden="true" />
                  Deactivate staffing rule
                </button>
              </form>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
}

function formatRuleDates(rule: StaffingRuleRecord) {
  if (!rule.effectiveStartDate && !rule.effectiveEndDate) {
    return "Always active";
  }

  return `${rule.effectiveStartDate ? formatDisplayDate(rule.effectiveStartDate) : "Any start"} - ${rule.effectiveEndDate ? formatDisplayDate(rule.effectiveEndDate) : "Any end"}`;
}

function formatWeekday(weekday: number | null) {
  if (weekday === null) {
    return "Any weekday";
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
