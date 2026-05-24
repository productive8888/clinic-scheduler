import { SlidersHorizontal } from "lucide-react";
import { SchedulingRuleForm } from "@/components/admin/scheduling-rule-form";
import { SchedulingRuleList } from "@/components/admin/scheduling-rule-list";
import { SetupRequired } from "@/components/layout/setup-required";
import { getSchedulingRulesPageData } from "@/lib/db/scheduling-rules";

export const dynamic = "force-dynamic";

export default async function SchedulingRulesPage() {
  let data: Awaited<ReturnType<typeof getSchedulingRulesPageData>>;

  try {
    data = await getSchedulingRulesPageData();
  } catch (error) {
    return (
      <SetupRequired
        title="Connect PostgreSQL before managing scheduling rules"
        message="Set DATABASE_URL, run the Prisma migration, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  const [rules, employees, taskTypes] = data;
  const activeCount = rules.filter((rule) => rule.active).length;

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
          Scheduling rules
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          Configurable assignment priorities
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Rules influence scoring after hard constraints like skills, PTO,
          availability, and double-booking have already been enforced.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          <SlidersHorizontal size={16} aria-hidden="true" />
          {activeCount} active
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Create rule</h2>
        <div className="mt-4">
          <SchedulingRuleForm employees={employees} taskTypes={taskTypes} />
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold text-slate-950">Rules</h2>
        <SchedulingRuleList
          rules={rules}
          employees={employees}
          taskTypes={taskTypes}
        />
      </section>
    </div>
  );
}
