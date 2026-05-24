import {
  Activity,
  BarChart3,
  CalendarDays,
  CalendarCheck2,
  ClipboardList,
  LogOut,
  Settings,
  SlidersHorizontal,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/app/logout/actions";
import { DevUserSwitcher } from "@/components/auth/dev-user-switcher";
import {
  getCurrentActor,
  getLocalDevSwitchEmployees,
  isManagerRole,
} from "@/lib/auth";

const employeeNavItems = [
  { href: "/employee", label: "My profile", icon: UserRound },
];

const managerNavItems = [
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  ...employeeNavItems,
  { href: "/admin", label: "Admin", icon: Settings },
  { href: "/admin/employees", label: "Employees", icon: Users },
  { href: "/admin/pto", label: "PTO", icon: CalendarCheck2 },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/rules", label: "Rules", icon: SlidersHorizontal },
  { href: "/admin/audit", label: "Audit", icon: Activity },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [actor, devEmployees] = await Promise.all([
    getCurrentActor(),
    getLocalDevSwitchEmployees(),
  ]);
  const canManage = Boolean(actor && isManagerRole(actor.role));
  const navItems = canManage ? managerNavItems : employeeNavItems;
  const homeHref = canManage ? "/schedule" : "/employee";

  return (
    <div className="min-h-screen bg-stone-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <Link href={homeHref} className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-emerald-700 text-white">
              <ClipboardList size={20} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold uppercase tracking-normal text-emerald-800">
                Clinic Scheduler
              </span>
              <span className="block text-xs text-slate-500">
                Staffing operations
              </span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                >
                  <Icon size={16} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="min-w-48 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <div className="font-medium text-slate-900">
              {actor?.fullName ?? "Not signed in"}
            </div>
            <div className="text-xs text-slate-500">
              {actor?.isLocalDev
                ? `${actor.role} · development`
                : actor?.role ?? "Guest"}
            </div>
          </div>
          {actor && !actor.isLocalDev && !actor.isDevFallback ? (
            <form action={logoutAction}>
              <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100">
                <LogOut size={16} aria-hidden="true" />
                Logout
              </button>
            </form>
          ) : !actor ? (
            <Link
              href="/login"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
            >
              Login
            </Link>
          ) : null}
          <DevUserSwitcher
            employees={devEmployees}
            currentEmployeeId={actor?.isDevFallback ? null : actor?.id}
          />
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
