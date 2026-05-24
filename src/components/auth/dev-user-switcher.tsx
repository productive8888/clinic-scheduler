import { UserCog } from "lucide-react";
import { switchLocalDevUserAction } from "@/app/(app)/dev/actions";
import type { DevSwitchEmployee } from "@/lib/auth";

export function DevUserSwitcher({
  employees,
  currentEmployeeId,
}: {
  employees: DevSwitchEmployee[];
  currentEmployeeId?: string | null;
}) {
  if (employees.length === 0) {
    return null;
  }

  return (
    <form
      action={switchLocalDevUserAction}
      className="grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm sm:min-w-72"
    >
      <label className="grid gap-1 font-medium text-amber-950">
        <span className="inline-flex items-center gap-2">
          <UserCog size={16} aria-hidden="true" />
          Local user
        </span>
        <select
          name="employeeId"
          defaultValue={currentEmployeeId ?? ""}
          className="h-9 rounded-md border border-amber-200 bg-white px-2 text-slate-950 outline-none focus:border-amber-500"
        >
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.fullName} ({employee.role})
            </option>
          ))}
        </select>
      </label>
      <button className="h-9 rounded-md bg-amber-800 px-3 text-sm font-semibold text-white hover:bg-amber-900">
        Switch
      </button>
    </form>
  );
}
