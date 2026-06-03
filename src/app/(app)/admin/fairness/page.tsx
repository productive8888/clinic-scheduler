import { FairnessWindowType } from "@prisma/client";
import { Scale } from "lucide-react";
import { updateFairnessSettingsAction } from "@/app/(app)/admin/fairness/actions";
import { SetupRequired } from "@/components/layout/setup-required";
import { getFairnessSettings } from "@/lib/db/fairness-settings";
import { toIsoDate } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

export default async function FairnessSettingsPage() {
  let setting: Awaited<ReturnType<typeof getFairnessSettings>>;

  try {
    setting = await getFairnessSettings();
  } catch (error) {
    return (
      <SetupRequired
        title="Connect PostgreSQL before managing fairness settings"
        message="Set DATABASE_URL, run the Prisma migration, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
          Fairness settings
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          Configurable balancing window
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          These settings influence scoring only after hard constraints pass.
          They are intentionally editable while the final clinic fairness policy
          is still being decided.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          <Scale size={16} aria-hidden="true" />
          {formatEnumLabel(setting.windowType)}
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <form action={updateFairnessSettingsAction} className="grid gap-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Window
              <select
                name="windowType"
                defaultValue={setting.windowType}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
              >
                {Object.values(FairnessWindowType).map((windowType) => (
                  <option key={windowType} value={windowType}>
                    {formatEnumLabel(windowType)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Custom start
              <input
                name="customStartDate"
                type="date"
                defaultValue={
                  setting.customStartDate ? toIsoDate(setting.customStartDate) : ""
                }
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Custom end
              <input
                name="customEndDate"
                type="date"
                defaultValue={
                  setting.customEndDate ? toIsoDate(setting.customEndDate) : ""
                }
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            {[
              ["clinicalShiftWeight", "Clinical"],
              ["patientFacingShiftWeight", "Patient-facing"],
              ["totalShiftWeight", "Total shifts"],
              ["totalHoursWeight", "Hours"],
              ["saturdayShiftWeight", "Saturday"],
              ["endoscopyShiftWeight", "Endoscopy"],
              ["patternConsistencyWeight", "Pattern"],
              ["skillRoleBalanceWeight", "Skill/role"],
              ["exposureGoalWeight", "GI/Allergy/PCP"],
              ["backgroundPenaltyWeight", "Background defer"],
            ].map(([name, label]) => (
              <label
                key={name}
                className="grid gap-1 text-sm font-medium text-slate-700"
              >
                {label}
                <input
                  name={name}
                  type="number"
                  min="0"
                  max="200"
                  defaultValue={Number(setting[name as keyof typeof setting])}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
                />
              </label>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              name="active"
              type="checkbox"
              defaultChecked={setting.active}
              className="size-4 accent-emerald-700"
            />
            Active
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Notes
            <textarea
              name="notes"
              rows={3}
              defaultValue={setting.notes ?? ""}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none focus:border-emerald-700"
            />
          </label>

          <button className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800">
            <Scale size={16} aria-hidden="true" />
            Save fairness settings
          </button>
        </form>
      </section>
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
