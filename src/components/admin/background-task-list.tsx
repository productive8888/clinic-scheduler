import type {
  BackgroundTaskCategory,
  BackgroundTaskDefinition,
  Employee,
  Skill,
  TaskType,
} from "@prisma/client";
import { CircleOff } from "lucide-react";
import { deactivateBackgroundTaskDefinitionAction } from "@/app/(app)/admin/background-tasks/actions";
import { BackgroundTaskDefinitionForm } from "@/components/admin/background-task-definition-form";

type BackgroundTaskDefinitionRecord = BackgroundTaskDefinition & {
  primaryOwner: Employee | null;
  taskType: TaskType | null;
  eligibleEmployees: { employeeId: string; employee: Employee }[];
  requiredSkills: { skillId: string; skill: Skill }[];
  _count: { instances: number };
};

type BackgroundTaskCategoryRecord = BackgroundTaskCategory & {
  definitions: BackgroundTaskDefinitionRecord[];
};

export function BackgroundTaskList({
  categories,
  employees,
  skills,
  taskTypes,
}: {
  categories: BackgroundTaskCategoryRecord[];
  employees: { id: string; fullName: string }[];
  skills: { id: string; name: string; code: string }[];
  taskTypes: { id: string; name: string; code: string }[];
}) {
  if (categories.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No background task categories yet. Add a category first, then define
        non-clinic work obligations inside it.
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {categories.map((category) => (
        <section
          key={category.id}
          className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-950">
                  {category.name}
                </h2>
                <span
                  className={
                    category.active
                      ? "rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
                      : "rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600"
                  }
                >
                  {category.active ? "ACTIVE" : "INACTIVE"}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-600">
                  {category.code}
                </span>
              </div>
              {category.description ? (
                <p className="mt-2 text-sm text-slate-500">
                  {category.description}
                </p>
              ) : null}
            </div>
            <span className="text-sm text-slate-500">
              {category.definitions.length} definitions
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            {category.definitions.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                No task definitions in this category.
              </div>
            ) : null}
            {category.definitions.map((definition) => (
              <details
                key={definition.id}
                className="rounded-md border border-slate-200 bg-slate-50"
              >
                <summary className="grid cursor-pointer gap-3 px-4 py-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-950">
                        {definition.name}
                      </span>
                      <span
                        className={
                          definition.active
                            ? "rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
                            : "rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600"
                        }
                      >
                        {definition.active ? "ACTIVE" : "INACTIVE"}
                      </span>
                      {definition.canBePulledForClinic ? (
                        <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                          pullable
                        </span>
                      ) : null}
                      {definition.protectedFromPull ? (
                        <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">
                          protected
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {Number(definition.estimatedHoursPerPeriod)} hours /{" "}
                      {definition.requiredCountPerPeriod ?? "hours-based"} slots /{" "}
                      {formatEnumLabel(definition.periodType)} / priority{" "}
                      {definition.priority}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Owner: {definition.primaryOwner?.fullName ?? "None"} / Skills:{" "}
                      {definition.requiredSkills.length
                        ? definition.requiredSkills
                            .map((skill) => skill.skill.name)
                            .join(", ")
                        : "None"}
                      {" / "}Task type: {definition.taskType?.name ?? "Not linked"}
                    </p>
                  </div>
                  <span className="text-sm text-slate-500">
                    {definition._count.instances} instances
                  </span>
                </summary>
                <div className="grid gap-4 border-t border-slate-200 p-4">
                  <BackgroundTaskDefinitionForm
                    definition={definition}
                    categories={categories}
                    employees={employees}
                    skills={skills}
                    taskTypes={taskTypes}
                  />
                  {definition.active ? (
                    <form
                      action={deactivateBackgroundTaskDefinitionAction.bind(
                        null,
                        definition.id,
                      )}
                    >
                      <button className="inline-flex h-10 items-center gap-2 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50">
                        <CircleOff size={16} aria-hidden="true" />
                        Deactivate background task
                      </button>
                    </form>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
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
