import type { StaffingRequirementRule, TaskType } from "@prisma/client";
import { Save, SlidersHorizontal } from "lucide-react";
import {
  createStaffingRequirementRuleAction,
  updateStaffingRequirementRuleAction,
} from "@/app/(app)/admin/staffing/actions";
import { supportedTaskSlotRequirementLevels } from "@/lib/validation/staffing-requirement";
import { toIsoDate } from "@/lib/utils/date";

type StaffingRuleTaskType = Pick<TaskType, "id" | "name" | "code" | "optional">;

type StaffingRequirementFormProps = {
  taskTypes: StaffingRuleTaskType[];
  rule?: StaffingRequirementRule;
};

const weekdays = [
  { value: "", label: "Any weekday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
];

const scenarios = [
  { value: "", label: "Any scenario" },
  { value: "ROUTINE", label: "Routine" },
  { value: "DOCTOR_OFF_REDUCED_STAFFING", label: "Doctor Off / Reduced Staffing" },
  { value: "CUSTOM", label: "Custom Scenario" },
  { value: "CLINIC_CLOSED", label: "Clinic Closed" },
];

export function StaffingRequirementForm({
  taskTypes,
  rule,
}: StaffingRequirementFormProps) {
  const action = rule
    ? updateStaffingRequirementRuleAction.bind(null, rule.id)
    : createStaffingRequirementRuleAction;

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-4">
        <label className="grid gap-1 text-sm font-medium text-slate-700 lg:col-span-2">
          Task type
          <select
            name="taskTypeId"
            required
            defaultValue={rule?.taskTypeId ?? ""}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            <option value="">Select task type</option>
            {taskTypes.map((taskType) => (
              <option key={taskType.id} value={taskType.id}>
                {taskType.name}
                {taskType.optional ? " (optional)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Weekday
          <select
            name="weekday"
            defaultValue={rule?.weekday?.toString() ?? ""}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            {weekdays.map((weekday) => (
              <option key={weekday.value} value={weekday.value}>
                {weekday.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Scenario
          <select
            name="scenario"
            defaultValue={rule?.scenario ?? ""}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            {scenarios.map((scenario) => (
              <option key={scenario.value} value={scenario.value}>
                {scenario.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Min required
          <input
            name="minRequiredSlots"
            type="number"
            min="0"
            max="20"
            defaultValue={rule?.minRequiredSlots ?? 1}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Desired
          <input
            name="desiredSlots"
            type="number"
            min="0"
            max="20"
            defaultValue={rule?.desiredSlots ?? 1}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Max
          <input
            name="maxSlots"
            type="number"
            min="0"
            max="20"
            defaultValue={rule?.maxSlots ?? 1}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Extra slot level
          <select
            name="requirementLevel"
            defaultValue={rule?.requirementLevel ?? "DESIRED"}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            {supportedTaskSlotRequirementLevels.map((level) => (
              <option key={level} value={level}>
                {formatEnumLabel(level)}
              </option>
            ))}
          </select>
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
        {rule ? "Save staffing rule" : "Create staffing rule"}
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
