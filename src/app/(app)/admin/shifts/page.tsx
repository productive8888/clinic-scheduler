import { Clock3 } from "lucide-react";
import { ShiftTemplateForm } from "@/components/admin/shift-template-form";
import { ShiftTemplateList } from "@/components/admin/shift-template-list";
import { SetupRequired } from "@/components/layout/setup-required";
import { getShiftTemplatesPageData } from "@/lib/db/shift-templates";

export const dynamic = "force-dynamic";

export default async function ShiftTemplatesPage() {
  let templates: Awaited<ReturnType<typeof getShiftTemplatesPageData>>;

  try {
    templates = await getShiftTemplatesPageData();
  } catch (error) {
    return (
      <SetupRequired
        title="Connect PostgreSQL before managing shift templates"
        message="Set DATABASE_URL, run the Prisma migration, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  const activeCount = templates.filter((template) => template.active).length;

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
          Shift templates
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          Spreadsheet shift blocks
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Configure reusable AM, PM, Saturday, endoscopy, float, and other shift
          blocks. Schedule preparation snapshots these templates into dated
          shift blocks so historical schedules stay stable.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          <Clock3 size={16} aria-hidden="true" />
          {activeCount} active
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">
          Create shift template
        </h2>
        <div className="mt-4">
          <ShiftTemplateForm />
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold text-slate-950">Templates</h2>
        <ShiftTemplateList templates={templates} />
      </section>
    </div>
  );
}
