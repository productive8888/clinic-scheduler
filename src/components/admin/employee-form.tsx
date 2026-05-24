import type { Employee, EmployeeSkill, Skill } from "@prisma/client";
import { Save, UserPlus } from "lucide-react";
import { createEmployeeAction, updateEmployeeAction } from "@/app/(app)/admin/employees/actions";
import { toIsoDate } from "@/lib/utils/date";

type EmployeeWithSkills = Employee & {
  skills: EmployeeSkill[];
};

type EmployeeFormProps = {
  skills: Skill[];
  employee?: EmployeeWithSkills;
};

export function EmployeeForm({ skills, employee }: EmployeeFormProps) {
  const action = employee
    ? updateEmployeeAction.bind(null, employee.id)
    : createEmployeeAction;
  const selectedSkillIds = new Set(employee?.skills.map((skill) => skill.skillId));

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Full name
          <input
            name="fullName"
            required
            defaultValue={employee?.fullName}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Email
          <input
            name="email"
            type="email"
            required
            defaultValue={employee?.email}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Clerk user ID
          <input
            name="authProviderId"
            defaultValue={employee?.authProviderId ?? ""}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm text-slate-950 outline-none focus:border-emerald-700"
            placeholder="user_..."
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Role
          <select
            name="role"
            defaultValue={employee?.role ?? "EMPLOYEE"}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            <option value="EMPLOYEE">Employee</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Status
          <select
            name="status"
            defaultValue={employee?.status ?? "ACTIVE"}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          PTO balance hours
          <input
            name="ptoBalanceHours"
            type="number"
            min="0"
            step="0.25"
            defaultValue={employee?.ptoBalanceHours.toString() ?? "0"}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Weekly assignment limit
          <input
            name="weeklyAssignmentLimit"
            type="number"
            min="1"
            defaultValue={employee?.weeklyAssignmentLimit ?? ""}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Start date
          <input
            name="startDate"
            type="date"
            required
            defaultValue={employee ? toIsoDate(employee.startDate) : toIsoDate(new Date())}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          End date
          <input
            name="endDate"
            type="date"
            defaultValue={employee?.endDate ? toIsoDate(employee.endDate) : ""}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold text-slate-900">Skills</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <label
              key={skill.id}
              className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <input
                type="checkbox"
                name="skillIds"
                value={skill.id}
                defaultChecked={selectedSkillIds.has(skill.id)}
                className="size-4 accent-emerald-700"
              />
              {skill.name}
            </label>
          ))}
        </div>
      </fieldset>

      {!employee ? (
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="createDefaultAvailability"
            className="size-4 accent-emerald-700"
          />
          Add Monday-Friday 8 AM-5 PM availability
        </label>
      ) : null}

      <button className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800">
        {employee ? <Save size={16} aria-hidden="true" /> : <UserPlus size={16} aria-hidden="true" />}
        {employee ? "Save employee" : "Create employee"}
      </button>
    </form>
  );
}
