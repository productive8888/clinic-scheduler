import type {
  Employee,
  EmployeeSkill,
  Skill,
  WeeklyAvailability,
} from "@prisma/client";
import { Save, UserPlus } from "lucide-react";
import { createEmployeeAction, updateEmployeeAction } from "@/app/(app)/admin/employees/actions";
import {
  isDefaultWorkingWeekday,
  STANDARD_SHIFT_END_MINUTE,
  STANDARD_SHIFT_START_MINUTE,
  WEEKDAYS,
} from "@/lib/availability";
import { toIsoDate } from "@/lib/utils/date";
import { minuteToTimeInput } from "@/lib/utils/time";

type EmployeeWithSkills = Employee & {
  skills: EmployeeSkill[];
  availability?: WeeklyAvailability[];
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
  const availabilityByWeekday = new Map(
    employee?.availability
      ?.filter((window) => window.active)
      .map((window) => [window.weekday, window]) ?? [],
  );

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

      <fieldset className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">
          Normal weekly schedule
        </legend>
        <div className="grid gap-3">
          {WEEKDAYS.map((day) => {
            const existingWindow = availabilityByWeekday.get(day.value);
            const defaultChecked = employee
              ? Boolean(existingWindow)
              : isDefaultWorkingWeekday(day.value);
            const startMinute =
              existingWindow?.startMinute ?? STANDARD_SHIFT_START_MINUTE;
            const endMinute = existingWindow?.endMinute ?? STANDARD_SHIFT_END_MINUTE;

            return (
              <div
                key={day.value}
                className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(8rem,1fr)_1fr_1fr] sm:items-end"
              >
                <label className="flex min-h-10 items-center gap-2 text-sm font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    name={`availability.${day.value}.active`}
                    defaultChecked={defaultChecked}
                    className="size-4 accent-emerald-700"
                  />
                  {day.label}
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Start
                  <input
                    type="time"
                    name={`availability.${day.value}.start`}
                    defaultValue={minuteToTimeInput(startMinute)}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  End
                  <input
                    type="time"
                    name={`availability.${day.value}.end`}
                    defaultValue={minuteToTimeInput(endMinute)}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
                  />
                </label>
              </div>
            );
          })}
        </div>
      </fieldset>

      <button className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800">
        {employee ? <Save size={16} aria-hidden="true" /> : <UserPlus size={16} aria-hidden="true" />}
        {employee ? "Save employee" : "Create employee"}
      </button>
    </form>
  );
}
