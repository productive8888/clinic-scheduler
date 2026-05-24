import { CalendarClock, CalendarX, IdCard, ShieldCheck } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { SetupRequired } from "@/components/layout/setup-required";
import { PTORequestForm } from "@/components/pto/pto-request-form";
import { PTORequestList } from "@/components/pto/pto-request-list";
import { createMyPtoRequestAction } from "@/app/(app)/employee/actions";
import { getCurrentActor } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getEmployeePtoPageData } from "@/lib/db/pto";
import { formatDisplayDate } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

type EmployeeAssignment = Prisma.AssignmentGetPayload<{
  include: {
    taskSlot: {
      include: {
        scheduleDay: true;
        taskType: true;
      };
    };
  };
}>;

type EmployeePtoPageData = Awaited<ReturnType<typeof getEmployeePtoPageData>>;

export default async function EmployeePage() {
  const actor = await getCurrentActor();
  let assignments: EmployeeAssignment[] = [];
  let employeeProfile: EmployeePtoPageData[0] = null;
  let ptoRequests: EmployeePtoPageData[1] = [];

  try {
    if (actor && !actor.isDevFallback) {
      const [assignmentRows, ptoData] = await Promise.all([
        getDb().assignment.findMany({
          where: {
            employeeId: actor.id,
            status: "ACTIVE",
          },
          include: {
            taskSlot: {
              include: {
                scheduleDay: true,
                taskType: true,
              },
            },
          },
          orderBy: { assignedAt: "desc" },
          take: 10,
        }),
        getEmployeePtoPageData(actor.id),
      ]);

      assignments = assignmentRows;
      employeeProfile = ptoData[0];
      ptoRequests = ptoData[1];
    }
  } catch (error) {
    return (
      <SetupRequired
        title="Connect PostgreSQL before viewing employee assignments"
        message="Set DATABASE_URL, run the Prisma migration and seed, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
          Employee portal
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          {actor?.fullName ?? "Profile"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          View assigned tasks, role information, and schedule status.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-white p-5">
          <IdCard className="text-emerald-700" size={22} aria-hidden="true" />
          <h2 className="mt-3 text-sm font-semibold text-slate-500">Email</h2>
          <p className="mt-1 font-medium text-slate-950">
            {actor?.email ?? "Not signed in"}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-5">
          <ShieldCheck className="text-emerald-700" size={22} aria-hidden="true" />
          <h2 className="mt-3 text-sm font-semibold text-slate-500">Role</h2>
          <p className="mt-1 font-medium text-slate-950">{actor?.role ?? "Guest"}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-5">
          <CalendarClock className="text-emerald-700" size={22} aria-hidden="true" />
          <h2 className="mt-3 text-sm font-semibold text-slate-500">
            Upcoming assignments
          </h2>
          <p className="mt-1 font-medium text-slate-950">{assignments.length}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-5">
          <CalendarX className="text-emerald-700" size={22} aria-hidden="true" />
          <h2 className="mt-3 text-sm font-semibold text-slate-500">
            PTO balance
          </h2>
          <p className="mt-1 font-medium text-slate-950">
            {employeeProfile?.ptoBalanceHours.toString() ?? "0"} hours
          </p>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">
          Request time off or unavailability
        </h2>
        <div className="mt-4">
          {actor && !actor.isDevFallback ? (
            <PTORequestForm action={createMyPtoRequestAction} />
          ) : (
            <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              Self-service PTO appears after signing in with a linked employee
              profile.
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold text-slate-950">My PTO requests</h2>
        <PTORequestList requests={ptoRequests} mode="employee" />
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">My assignments</h2>
        <div className="mt-4 grid gap-3">
          {assignments.length ? (
            assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="flex flex-col gap-1 rounded-md border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-950">
                    {assignment.taskSlot.taskType.name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {formatDisplayDate(assignment.taskSlot.scheduleDay.date)}
                  </p>
                </div>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                  {assignment.source}
                </span>
              </div>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              No active assignments are linked to this profile yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
