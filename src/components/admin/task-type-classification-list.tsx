import { updateTaskTypeClassificationAction } from "@/app/(app)/admin/staffing/actions";

type TaskTypeClassification = {
  id: string;
  name: string;
  code: string;
  optional: boolean;
  isPatientFacing: boolean;
  isClinical: boolean;
  isBackground: boolean;
  isSkilled: boolean;
  isEndoscopy: boolean;
  isFloat: boolean;
  isClosureCandidate: boolean;
};

export function TaskTypeClassificationList({
  taskTypes,
}: {
  taskTypes: TaskTypeClassification[];
}) {
  return (
    <div className="grid gap-3">
      {taskTypes.map((taskType) => (
        <form
          key={taskType.id}
          action={updateTaskTypeClassificationAction.bind(null, taskType.id)}
          className="rounded-md border border-slate-200 bg-slate-50 p-4"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="font-semibold text-slate-950">{taskType.name}</div>
              <div className="mt-1 text-xs font-medium text-slate-500">
                {taskType.code} / {taskType.optional ? "optional" : "routine-capable"}
              </div>
            </div>
            <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100">
              Save flags
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-sm font-medium text-slate-700">
            <FlagCheckbox
              name="isPatientFacing"
              label="Patient-facing"
              defaultChecked={taskType.isPatientFacing}
            />
            <FlagCheckbox
              name="isClinical"
              label="Clinical"
              defaultChecked={taskType.isClinical}
            />
            <FlagCheckbox
              name="isBackground"
              label="Background"
              defaultChecked={taskType.isBackground}
            />
            <FlagCheckbox
              name="isSkilled"
              label="Skilled"
              defaultChecked={taskType.isSkilled}
            />
            <FlagCheckbox
              name="isEndoscopy"
              label="Endoscopy"
              defaultChecked={taskType.isEndoscopy}
            />
            <FlagCheckbox
              name="isFloat"
              label="Float"
              defaultChecked={taskType.isFloat}
            />
            <FlagCheckbox
              name="isClosureCandidate"
              label="Closure candidate"
              defaultChecked={taskType.isClosureCandidate}
            />
          </div>
        </form>
      ))}
    </div>
  );
}

function FlagCheckbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 accent-emerald-700"
      />
      {label}
    </label>
  );
}
