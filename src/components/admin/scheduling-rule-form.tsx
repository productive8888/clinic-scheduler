import type { Employee, SchedulingRule, TaskType } from "@prisma/client";
import { Save, SlidersHorizontal } from "lucide-react";
import {
  createSchedulingRuleAction,
  updateSchedulingRuleAction,
} from "@/app/(app)/admin/rules/actions";
import { supportedSchedulingRuleTypes } from "@/lib/validation/scheduling-rule";
import { toIsoDate } from "@/lib/utils/date";

type RuleEmployee = Pick<Employee, "id" | "fullName" | "role">;
type RuleTaskType = Pick<TaskType, "id" | "name" | "code">;

type SchedulingRuleFormProps = {
  employees: RuleEmployee[];
  taskTypes: RuleTaskType[];
  rule?: SchedulingRule;
};

export function SchedulingRuleForm({
  employees,
  taskTypes,
  rule,
}: SchedulingRuleFormProps) {
  const action = rule
    ? updateSchedulingRuleAction.bind(null, rule.id)
    : createSchedulingRuleAction;

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-4">
        <label className="grid gap-1 text-sm font-medium text-slate-700 lg:col-span-2">
          Rule type
          <select
            name="type"
            defaultValue={rule?.type ?? "PREFER_EMPLOYEE_FOR_TASK"}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            {supportedSchedulingRuleTypes.map((type) => (
              <option key={type} value={type}>
                {formatEnumLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Weight
          <input
            name="weight"
            type="number"
            min="0"
            max="1000"
            defaultValue={rule?.weight ?? 25}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700">
          <input
            name="active"
            type="checkbox"
            defaultChecked={rule?.active ?? true}
            className="size-4 accent-emerald-700"
          />
          Active
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Employee
          <select
            name="employeeId"
            required
            defaultValue={rule?.employeeId ?? ""}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            <option value="">Select employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName} ({employee.role})
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Task type
          <select
            name="taskTypeId"
            defaultValue={rule?.taskTypeId ?? ""}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            <option value="">Any task</option>
            {taskTypes.map((taskType) => (
              <option key={taskType.id} value={taskType.id}>
                {taskType.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Effective start
          <input
            name="effectiveStartDate"
            type="date"
            defaultValue={
              rule?.effectiveStartDate ? toIsoDate(rule.effectiveStartDate) : ""
            }
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Effective end
          <input
            name="effectiveEndDate"
            type="date"
            defaultValue={
              rule?.effectiveEndDate ? toIsoDate(rule.effectiveEndDate) : ""
            }
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Notes
        <textarea
          name="notes"
          rows={2}
          defaultValue={rule?.notes ?? ""}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none focus:border-emerald-700"
        />
      </label>

      <button className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800">
        {rule ? (
          <Save size={16} aria-hidden="true" />
        ) : (
          <SlidersHorizontal size={16} aria-hidden="true" />
        )}
        {rule ? "Save rule" : "Create rule"}
      </button>
    </form>
  );
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
