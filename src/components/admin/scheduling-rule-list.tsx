import type { Employee, SchedulingRule, TaskType } from "@prisma/client";
import { CircleOff } from "lucide-react";
import { deactivateSchedulingRuleAction } from "@/app/(app)/admin/rules/actions";
import { SchedulingRuleForm } from "@/components/admin/scheduling-rule-form";
import { formatDisplayDate } from "@/lib/utils/date";

type RuleRecord = SchedulingRule & {
  employee: Employee | null;
  taskType: TaskType | null;
  createdBy: Employee | null;
};

type RuleEmployee = Pick<Employee, "id" | "fullName" | "role">;
type RuleTaskType = Pick<TaskType, "id" | "name" | "code">;

export function SchedulingRuleList({
  rules,
  employees,
  taskTypes,
}: {
  rules: RuleRecord[];
  employees: RuleEmployee[];
  taskTypes: RuleTaskType[];
}) {
  if (rules.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No scheduling rules yet. Create the first rule to influence generated
        assignments.
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
                  {formatEnumLabel(rule.type)}
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
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                  weight {rule.weight}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {rule.employee?.fullName ?? "Any employee"} /{" "}
                {rule.taskType?.name ?? "Any task"}
              </p>
              {rule.notes ? (
                <p className="mt-2 text-sm text-slate-600">{rule.notes}</p>
              ) : null}
            </div>
            <div className="text-sm text-slate-500">
              {formatRuleDates(rule)}
            </div>
          </summary>
          <div className="grid gap-4 border-t border-slate-200 p-4">
            <SchedulingRuleForm
              rule={rule}
              employees={employees}
              taskTypes={taskTypes}
            />
            {rule.active ? (
              <form action={deactivateSchedulingRuleAction.bind(null, rule.id)}>
                <button className="inline-flex h-10 items-center gap-2 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50">
                  <CircleOff size={16} aria-hidden="true" />
                  Deactivate rule
                </button>
              </form>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
}

function formatRuleDates(rule: RuleRecord) {
  if (!rule.effectiveStartDate && !rule.effectiveEndDate) {
    return "Always active";
  }

  return `${rule.effectiveStartDate ? formatDisplayDate(rule.effectiveStartDate) : "Any start"} - ${rule.effectiveEndDate ? formatDisplayDate(rule.effectiveEndDate) : "Any end"}`;
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
