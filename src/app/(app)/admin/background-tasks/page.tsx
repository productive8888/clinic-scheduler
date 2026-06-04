import { CalendarRange, Workflow } from "lucide-react";
import { generateBackgroundTaskSlotsAction } from "@/app/(app)/admin/background-tasks/actions";
import { BackgroundPullRuleList } from "@/components/admin/background-pull-rule-list";
import { BackgroundTaskCategoryForm } from "@/components/admin/background-task-category-form";
import { BackgroundTaskDefinitionForm } from "@/components/admin/background-task-definition-form";
import { BackgroundTaskList } from "@/components/admin/background-task-list";
import { SetupRequired } from "@/components/layout/setup-required";
import { getBackgroundTasksPageData } from "@/lib/db/background-tasks";

export const dynamic = "force-dynamic";

export default async function BackgroundTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ generated?: string; instances?: string }>;
}) {
  const params = await searchParams;
  let data: Awaited<ReturnType<typeof getBackgroundTasksPageData>>;

  try {
    data = await getBackgroundTasksPageData();
  } catch (error) {
    return (
      <SetupRequired
        title="Connect PostgreSQL before managing background tasks"
        message="Set DATABASE_URL, run the Prisma migration, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  const [categories, employees, skills, taskTypes, pullRules] = data;
  const activeDefinitionCount = categories.reduce(
    (count, category) =>
      count + category.definitions.filter((definition) => definition.active).length,
    0,
  );

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
          Background tasks
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          Non-clinic work obligations
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Define background obligations, estimated hours, eligibility, and
          whether work can be pulled for clinic coverage. Final prioritization
          and rollover logic are intentionally deferred.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          <Workflow size={16} aria-hidden="true" />
          {activeDefinitionCount} active definitions
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">
          Create category
        </h2>
        <div className="mt-4">
          <BackgroundTaskCategoryForm />
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <CalendarRange size={18} className="text-emerald-700" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-slate-950">
            Generate background task slots
          </h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Creates optional, period-linked slots from active definitions. Required
          clinic coverage remains higher priority during schedule generation.
        </p>
        {params.generated ? (
          <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
            Created {params.generated} slots across {params.instances ?? "0"} period
            instances.
          </p>
        ) : null}
        <form
          action={generateBackgroundTaskSlotsAction}
          className="mt-4 grid gap-3 sm:grid-cols-4"
        >
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Anchor date
            <input
              type="date"
              name="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Range
            <select
              name="mode"
              defaultValue="WEEK"
              className="h-10 rounded-md border border-slate-300 bg-white px-3"
            >
              <option value="WEEK">This week</option>
              <option value="CUSTOM">Custom range</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Custom start
            <input
              type="date"
              name="startDate"
              className="h-10 rounded-md border border-slate-300 bg-white px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Custom end
            <input
              type="date"
              name="endDate"
              className="h-10 rounded-md border border-slate-300 bg-white px-3"
            />
          </label>
          <button className="h-10 w-fit rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 sm:col-span-4">
            Generate background slots
          </button>
        </form>
      </section>

      {categories.length ? (
        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">
            Create task definition
          </h2>
          <div className="mt-4">
            <BackgroundTaskDefinitionForm
              categories={categories}
              employees={employees}
              skills={skills}
              taskTypes={taskTypes}
            />
          </div>
        </section>
      ) : null}

      <BackgroundPullRuleList rules={pullRules} employees={employees} />

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold text-slate-950">Definitions</h2>
        <BackgroundTaskList
          categories={categories}
          employees={employees}
          skills={skills}
          taskTypes={taskTypes}
        />
      </section>
    </div>
  );
}
