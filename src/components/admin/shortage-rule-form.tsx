import {
  ClinicScenario,
  ShiftCategory,
  type ShiftTemplate,
  type ShortageRule,
  type TaskType,
} from "@prisma/client";
import { Save, TriangleAlert } from "lucide-react";
import {
  createShortageRuleAction,
  updateShortageRuleAction,
} from "@/app/(app)/admin/shortages/actions";
import { toIsoDate } from "@/lib/utils/date";

type ShortageRuleFormProps = {
  rule?: ShortageRule;
  taskTypes: Pick<TaskType, "id" | "name" | "code">[];
  shiftTemplates: Pick<
    ShiftTemplate,
    "id" | "name" | "shiftCategory" | "dayOfWeek" | "startMinute" | "endMinute"
  >[];
};

export function ShortageRuleForm({
  rule,
  taskTypes,
  shiftTemplates,
}: ShortageRuleFormProps) {
  const action = rule
    ? updateShortageRuleAction.bind(null, rule.id)
    : createShortageRuleAction;

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-4">
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
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Shift template
          <select
            name="shiftTemplateId"
            defaultValue={rule?.shiftTemplateId ?? ""}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            <option value="">Any template</option>
            {shiftTemplates.map((shiftTemplate) => (
              <option key={shiftTemplate.id} value={shiftTemplate.id}>
                {shiftTemplate.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Shift category
          <select
            name="shiftCategory"
            defaultValue={rule?.shiftCategory ?? ""}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            <option value="">Any category</option>
            {Object.values(ShiftCategory).map((category) => (
              <option key={category} value={category}>
                {formatEnumLabel(category)}
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
            <option value="">Any scenario</option>
            {Object.values(ClinicScenario).map((scenario) => (
              <option key={scenario} value={scenario}>
                {formatEnumLabel(scenario)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[160px_1fr_120px]">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Priority
          <input
            name="closurePriority"
            type="number"
            min="0"
            max="10000"
            defaultValue={rule?.closurePriority ?? 100}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Manager instruction
          <input
            name="managerInstruction"
            required
            defaultValue={rule?.managerInstruction ?? ""}
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
          <TriangleAlert size={16} aria-hidden="true" />
        )}
        {rule ? "Save shortage rule" : "Create shortage rule"}
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
