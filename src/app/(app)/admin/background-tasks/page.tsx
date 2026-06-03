import { Workflow } from "lucide-react";
import { BackgroundPullRuleList } from "@/components/admin/background-pull-rule-list";
import { BackgroundTaskCategoryForm } from "@/components/admin/background-task-category-form";
import { BackgroundTaskDefinitionForm } from "@/components/admin/background-task-definition-form";
import { BackgroundTaskList } from "@/components/admin/background-task-list";
import { SetupRequired } from "@/components/layout/setup-required";
import { getBackgroundTasksPageData } from "@/lib/db/background-tasks";

export const dynamic = "force-dynamic";

export default async function BackgroundTasksPage() {
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

  const [categories, employees, skills, pullRules] = data;
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
        />
      </section>
    </div>
  );
}
