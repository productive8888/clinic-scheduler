import { TriangleAlert } from "lucide-react";
import { ShortageRuleForm } from "@/components/admin/shortage-rule-form";
import { ShortageRuleList } from "@/components/admin/shortage-rule-list";
import { SetupRequired } from "@/components/layout/setup-required";
import { getShortageRulesPageData } from "@/lib/db/shortage-rules";

export const dynamic = "force-dynamic";

export default async function ShortageRulesPage() {
  let data: Awaited<ReturnType<typeof getShortageRulesPageData>>;

  try {
    data = await getShortageRulesPageData();
  } catch (error) {
    return (
      <SetupRequired
        title="Connect PostgreSQL before managing shortage rules"
        message="Set DATABASE_URL, run the Prisma migration, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  const [rules, taskTypes, shiftTemplates] = data;
  const activeCount = rules.filter((rule) => rule.active).length;

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
          Shortage guidance
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          Configurable closure and cut instructions
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Store manager-facing recommendations for unfilled coverage. These
          rules do not hardcode final shutdown order; they make shortages
          visible with editable guidance while policy is being finalized.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          <TriangleAlert size={16} aria-hidden="true" />
          {activeCount} active
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">
          Create shortage rule
        </h2>
        <div className="mt-4">
          <ShortageRuleForm
            taskTypes={taskTypes}
            shiftTemplates={shiftTemplates}
          />
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold text-slate-950">Rules</h2>
        <ShortageRuleList
          rules={rules}
          taskTypes={taskTypes}
          shiftTemplates={shiftTemplates}
        />
      </section>
    </div>
  );
}
