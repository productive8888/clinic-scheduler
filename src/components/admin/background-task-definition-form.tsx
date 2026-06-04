import {
  BackgroundTaskPeriodType,
  type BackgroundTaskCategory,
  type BackgroundTaskDefinition,
} from "@prisma/client";
import { Save, Workflow } from "lucide-react";
import {
  createBackgroundTaskDefinitionAction,
  updateBackgroundTaskDefinitionAction,
} from "@/app/(app)/admin/background-tasks/actions";

type BackgroundTaskDefinitionFormProps = {
  definition?: BackgroundTaskDefinition & {
    eligibleEmployees?: { employeeId: string }[];
    requiredSkills?: { skillId: string }[];
  };
  categories: Pick<BackgroundTaskCategory, "id" | "name" | "active">[];
  employees: { id: string; fullName: string }[];
  skills: { id: string; name: string; code: string }[];
  taskTypes: { id: string; name: string; code: string }[];
};

export function BackgroundTaskDefinitionForm({
  definition,
  categories,
  employees,
  skills,
  taskTypes,
}: BackgroundTaskDefinitionFormProps) {
  const action = definition
    ? updateBackgroundTaskDefinitionAction.bind(null, definition.id)
    : createBackgroundTaskDefinitionAction;
  const selectedEmployeeIds =
    definition?.eligibleEmployees?.map((item) => item.employeeId) ?? [];
  const selectedSkillIds = definition?.requiredSkills?.map((item) => item.skillId) ?? [];

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Category
          <select
            name="categoryId"
            required
            defaultValue={definition?.categoryId ?? ""}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            <option value="">Select category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Generated task type
          <select
            name="taskTypeId"
            required
            defaultValue={definition?.taskTypeId ?? ""}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            <option value="">Select task type</option>
            {taskTypes.map((taskType) => (
              <option key={taskType.id} value={taskType.id}>
                {taskType.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700 lg:col-span-2">
          Task name
          <input
            name="name"
            required
            defaultValue={definition?.name ?? ""}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Period
          <select
            name="periodType"
            defaultValue={definition?.periodType ?? "WEEKLY"}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            {Object.values(BackgroundTaskPeriodType).map((periodType) => (
              <option key={periodType} value={periodType}>
                {formatEnumLabel(periodType)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-6">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Est. hours
          <input
            name="estimatedHoursPerPeriod"
            type="number"
            min="0"
            max="500"
            step="0.25"
            defaultValue={
              definition ? Number(definition.estimatedHoursPerPeriod) : 2
            }
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Required count
          <input
            name="requiredCountPerPeriod"
            type="number"
            min="0"
            max="500"
            defaultValue={definition?.requiredCountPerPeriod ?? ""}
            placeholder="Use hours"
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Custom days
          <input
            name="customPeriodDays"
            type="number"
            min="1"
            max="366"
            defaultValue={definition?.customPeriodDays ?? ""}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Priority
          <input
            name="priority"
            type="number"
            min="0"
            max="10000"
            defaultValue={definition?.priority ?? 100}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Mentor
          <input
            name="mentor"
            defaultValue={definition?.mentor ?? ""}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Primary owner
          <select
            name="primaryOwnerEmployeeId"
            defaultValue={definition?.primaryOwnerEmployeeId ?? ""}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            <option value="">None</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Eligible employees
          <select
            name="eligibleEmployeeIds"
            multiple
            defaultValue={selectedEmployeeIds}
            className="min-h-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none focus:border-emerald-700"
          >
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Required skills
          <select
            name="requiredSkillIds"
            multiple
            defaultValue={selectedSkillIds}
            className="min-h-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none focus:border-emerald-700"
          >
            {skills.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-sm font-medium text-slate-700">
        <label className="flex items-center gap-2">
          <input
            name="canBePulledForClinic"
            type="checkbox"
            defaultChecked={definition?.canBePulledForClinic ?? false}
            className="size-4 accent-emerald-700"
          />
          Pullable for clinic coverage
        </label>
        <label className="flex items-center gap-2">
          <input
            name="protectedFromPull"
            type="checkbox"
            defaultChecked={definition?.protectedFromPull ?? false}
            className="size-4 accent-emerald-700"
          />
          Protected from pull
        </label>
        <label className="flex items-center gap-2">
          <input
            name="rolloverAllowed"
            type="checkbox"
            defaultChecked={definition?.rolloverAllowed ?? true}
            className="size-4 accent-emerald-700"
          />
          Rollover allowed
        </label>
        <label className="flex items-center gap-2">
          <input
            name="active"
            type="checkbox"
            defaultChecked={definition?.active ?? true}
            className="size-4 accent-emerald-700"
          />
          Active
        </label>
      </div>

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Description
        <textarea
          name="description"
          rows={2}
          defaultValue={definition?.description ?? ""}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none focus:border-emerald-700"
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Notes
        <textarea
          name="notes"
          rows={2}
          defaultValue={definition?.notes ?? ""}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none focus:border-emerald-700"
        />
      </label>

      <button className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800">
        {definition ? (
          <Save size={16} aria-hidden="true" />
        ) : (
          <Workflow size={16} aria-hidden="true" />
        )}
        {definition ? "Save background task" : "Create background task"}
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
