import type { BackgroundPullRule, Employee } from "@prisma/client";
import {
  deactivateBackgroundPullRuleAction,
  upsertBackgroundPullRuleAction,
} from "@/app/(app)/admin/background-tasks/actions";

type PullRuleRecord = BackgroundPullRule & {
  employee: Employee;
};

export function BackgroundPullRuleList({
  rules,
  employees,
}: {
  rules: PullRuleRecord[];
  employees: { id: string; fullName: string }[];
}) {
  return (
    <div className="grid gap-4">
      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">
          Background pull priority
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Applies only to pullable, non-protected background work when clinic
          coverage needs a manager-reviewed sacrifice candidate.
        </p>
        <form
          action={upsertBackgroundPullRuleAction}
          className="mt-4 grid gap-3 lg:grid-cols-[1fr_120px_140px_auto]"
        >
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Employee
            <select
              name="employeeId"
              required
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
            >
              <option value="">Select employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName}
                </option>
              ))}
            </select>
          </label>
          <NumberField name="priorityRank" label="Rank" defaultValue={1} />
          <NumberField
            name="maxPullsPerPeriod"
            label="Max pulls"
            defaultValue={1}
            optional
          />
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              name="active"
              defaultChecked
              className="size-4 accent-emerald-700"
            />
            Active
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700 lg:col-span-4">
            Notes
            <textarea
              name="notes"
              rows={2}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none focus:border-emerald-700"
            />
          </label>
          <button className="h-10 w-fit rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 lg:col-span-4">
            Save pull rule
          </button>
        </form>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Configured order</h2>
        <div className="mt-4 grid gap-2">
          {rules.length === 0 ? (
            <p className="text-sm text-slate-500">
              No employee-specific pull rules configured yet.
            </p>
          ) : (
            rules.map((rule) => (
              <div
                key={rule.id}
                className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_auto] md:items-center"
              >
                <div>
                  <div className="font-semibold text-slate-950">
                    #{rule.priorityRank} {rule.employee.fullName}
                  </div>
                  <div className="text-sm text-slate-500">
                    Max pulls: {rule.maxPullsPerPeriod ?? "unlimited"} /{" "}
                    {rule.active ? "active" : "inactive"}
                  </div>
                  {rule.notes ? (
                    <div className="mt-1 text-sm text-slate-500">{rule.notes}</div>
                  ) : null}
                </div>
                {rule.active ? (
                  <form action={deactivateBackgroundPullRuleAction.bind(null, rule.id)}>
                    <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                      Deactivate
                    </button>
                  </form>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function NumberField({
  name,
  label,
  defaultValue,
  optional,
}: {
  name: string;
  label: string;
  defaultValue: number;
  optional?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <input
        type="number"
        name={name}
        min="0"
        defaultValue={optional ? "" : defaultValue}
        placeholder={optional ? "Unlimited" : undefined}
        className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
      />
    </label>
  );
}
