import type { Employee, EmployeeSkill, Skill } from "@prisma/client";
import { CircleOff, Pencil, ShieldCheck } from "lucide-react";
import { deactivateEmployeeAction } from "@/app/(app)/admin/employees/actions";
import { EmployeeForm } from "./employee-form";

type EmployeeRecord = Employee & {
  skills: Array<EmployeeSkill & { skill: Skill }>;
  availability: { id: string }[];
};

export function EmployeeDirectory({
  employees,
  skills,
}: {
  employees: EmployeeRecord[];
  skills: Skill[];
}) {
  if (employees.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No employees yet. Create the first profile to start staffing schedules.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {employees.map((employee) => (
        <details
          key={employee.id}
          className="rounded-md border border-slate-200 bg-white shadow-sm"
        >
          <summary className="grid cursor-pointer gap-3 px-4 py-4 md:grid-cols-[1fr_auto_auto] md:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-slate-950">
                  {employee.fullName}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                  {employee.role}
                </span>
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                  {employee.status}
                </span>
              </div>
              <div className="mt-1 text-sm text-slate-500">{employee.email}</div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              {employee.skills.length ? (
                employee.skills.map(({ skill }) => (
                  <span
                    key={skill.id}
                    className="rounded-md border border-slate-200 px-2 py-1"
                  >
                    {skill.name}
                  </span>
                ))
              ) : (
                <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
                  No skills
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1">
                <ShieldCheck size={16} aria-hidden="true" />
                {employee.availability.length} availability rows
              </span>
              <span className="inline-flex items-center gap-1">
                <Pencil size={16} aria-hidden="true" />
                Edit
              </span>
            </div>
          </summary>
          <div className="border-t border-slate-200 p-4">
            <EmployeeForm employee={employee} skills={skills} />
            {employee.status === "ACTIVE" ? (
              <form action={deactivateEmployeeAction.bind(null, employee.id)}>
                <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50">
                  <CircleOff size={16} aria-hidden="true" />
                  Deactivate employee
                </button>
              </form>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
}
