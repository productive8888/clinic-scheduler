import { CalendarDays, Database, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";

const adminLinks = [
  {
    href: "/admin/employees",
    title: "Employee profiles",
    description: "Manage staff, roles, skills, PTO balance, and availability.",
    icon: Users,
  },
  {
    href: "/schedule",
    title: "Daily schedule",
    description: "Create task slots, run the engine, and lock overrides.",
    icon: CalendarDays,
  },
];

export default function AdminPage() {
  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
          Manager workspace
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          Clinic operations control
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Configure the staffing data that drives deterministic schedule generation.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {adminLinks.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300"
            >
              <Icon className="text-emerald-700" size={24} aria-hidden="true" />
              <h2 className="mt-4 text-lg font-semibold text-slate-950">
                {item.title}
              </h2>
              <p className="mt-2 text-sm text-slate-500">{item.description}</p>
            </Link>
          );
        })}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-white p-5">
          <ShieldCheck className="text-emerald-700" size={22} aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-slate-950">
            RBAC enforced server-side
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Server actions verify manager/admin roles before modifying schedules or
            employees.
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-5">
          <Database className="text-emerald-700" size={22} aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-slate-950">
            Normalized data model
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Task types, task slots, and assignments are separate records for audit-safe
            schedule history.
          </p>
        </div>
      </section>
    </div>
  );
}
