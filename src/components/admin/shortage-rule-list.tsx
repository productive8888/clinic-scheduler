import type {
  Employee,
  ShiftTemplate,
  ShortageRule,
  TaskType,
} from "@prisma/client";
import { CircleOff } from "lucide-react";
import { deactivateShortageRuleAction } from "@/app/(app)/admin/shortages/actions";
import { ShortageRuleForm } from "@/components/admin/shortage-rule-form";
import { formatDisplayDate } from "@/lib/utils/date";

type ShortageRuleRecord = ShortageRule & {
  taskType: TaskType | null;
  shiftTemplate: ShiftTemplate | null;
  createdBy: Employee | null;
};

export function ShortageRuleList({
  rules,
  taskTypes,
  shiftTemplates,
}: {
  rules: ShortageRuleRecord[];
  taskTypes: Pick<TaskType, "id" | "name" | "code">[];
  shiftTemplates: Pick<
    ShiftTemplate,
    "id" | "name" | "shiftCategory" | "dayOfWeek" | "startMinute" | "endMinute"
  >[];
}) {
  if (rules.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No shortage rules yet. Shortage slots will still be visible, but manager
        cut/closure guidance will be blank until rules are configured.
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
                  {rule.taskType?.name ?? "Any task"}
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
                <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                  priority {rule.closurePriority}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {rule.shiftTemplate?.name ??
                  (rule.shiftCategory
                    ? `${formatEnumLabel(rule.shiftCategory)} shifts`
                    : "Any shift")}{" "}
                / {rule.scenario ? formatEnumLabel(rule.scenario) : "Any scenario"}
              </p>
              <p className="mt-2 text-sm font-medium text-slate-700">
                {rule.managerInstruction}
              </p>
            </div>
            <div className="text-sm text-slate-500">{formatRuleDates(rule)}</div>
          </summary>
          <div className="grid gap-4 border-t border-slate-200 p-4">
            <ShortageRuleForm
              rule={rule}
              taskTypes={taskTypes}
              shiftTemplates={shiftTemplates}
            />
            {rule.active ? (
              <form action={deactivateShortageRuleAction.bind(null, rule.id)}>
                <button className="inline-flex h-10 items-center gap-2 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50">
                  <CircleOff size={16} aria-hidden="true" />
                  Deactivate shortage rule
                </button>
              </form>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
}

function formatRuleDates(rule: ShortageRuleRecord) {
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
