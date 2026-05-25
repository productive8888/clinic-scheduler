import { Layers3 } from "lucide-react";
import { StaffingRequirementForm } from "@/components/admin/staffing-requirement-form";
import { StaffingRequirementList } from "@/components/admin/staffing-requirement-list";
import { SetupRequired } from "@/components/layout/setup-required";
import { getStaffingRequirementsPageData } from "@/lib/db/staffing-requirements";

export const dynamic = "force-dynamic";

export default async function StaffingRequirementsPage() {
  let data: Awaited<ReturnType<typeof getStaffingRequirementsPageData>>;

  try {
    data = await getStaffingRequirementsPageData();
  } catch (error) {
    return (
      <SetupRequired
        title="Connect PostgreSQL before managing staffing requirements"
        message="Set DATABASE_URL, run the Prisma migration, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  const [rules, taskTypes] = data;
  const activeCount = rules.filter((rule) => rule.active).length;

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
          Staffing requirements
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          Tiered multi-slot configuration
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Configure when a task type should create multiple dated slots. The
          scheduler fills required slots first, then desired, conditional, and
          optional slots when eligible staff remain.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          <Layers3 size={16} aria-hidden="true" />
          {activeCount} active
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">
          Create staffing rule
        </h2>
        <div className="mt-4">
          <StaffingRequirementForm taskTypes={taskTypes} />
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold text-slate-950">Rules</h2>
        <StaffingRequirementList rules={rules} taskTypes={taskTypes} />
      </section>
    </div>
  );
}
