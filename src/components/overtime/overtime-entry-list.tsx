import type { Employee, OvertimeRequest } from "@prisma/client";
import { Check, RotateCcw, X } from "lucide-react";
import {
  approveOvertimeEntryAction,
  rejectOvertimeEntryAction,
  reverseOvertimeApprovalAction,
} from "@/app/(app)/admin/overtime/actions";
import { cancelMyOvertimeEntryAction } from "@/app/(app)/employee/actions";
import { calculateOvertimeApproval } from "@/lib/overtime/policy";
import { formatDisplayDate } from "@/lib/utils/date";

type OvertimeRecord = OvertimeRequest & {
  employee: Employee;
  reviewedBy: Employee | null;
};

export function OvertimeEntryList({
  entries,
  mode,
}: {
  entries: OvertimeRecord[];
  mode: "employee" | "manager";
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No overtime has been logged yet.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {entries.map((entry) => {
        const projection =
          entry.status === "PENDING"
            ? calculateOvertimeApproval({
                requestedHours: Number(entry.requestedHours),
                optoBalanceHours: Number(entry.employee.optoBalanceHours),
              })
            : null;

        return (
          <article
            key={entry.id}
            className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-slate-950">
                    {mode === "manager" ? entry.employee.fullName : "Overtime"}
                  </h3>
                  <span className={statusTone(entry.status)}>{entry.status}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                    {Number(entry.requestedHours).toFixed(2)}h logged
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Worked {formatDisplayDate(entry.workDate)}
                </p>
                {entry.reason ? (
                  <p className="mt-2 text-sm text-slate-500">{entry.reason}</p>
                ) : null}

                {projection ? (
                  <div className="mt-3 grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 sm:grid-cols-3">
                    <Metric label="Current OPTO" value={projection.optoBalanceHours} />
                    <Metric label="Projected OPTO applied" value={projection.optoAppliedHours} />
                    <Metric label="Projected payable overtime" value={projection.payableOvertimeHours} />
                  </div>
                ) : (
                  <div className="mt-3 grid gap-2 rounded-md bg-slate-50 p-3 text-xs text-slate-700 sm:grid-cols-3">
                    <Metric label="OPTO applied hours" value={Number(entry.optoAppliedHours)} />
                    <Metric label="Payable overtime hours" value={Number(entry.payableOvertimeHours)} />
                    <div>
                      <span className="block text-slate-500">Reviewed</span>
                      <strong>
                        {entry.reviewedAt
                          ? entry.reviewedAt.toLocaleString()
                          : "Not reviewed"}
                      </strong>
                    </div>
                  </div>
                )}

                {entry.rejectionReason ? (
                  <p className="mt-3 rounded-md bg-rose-50 p-2 text-sm text-rose-800">
                    <strong>
                      {entry.status === "REVERSED"
                        ? "Reversal reason:"
                        : "Rejection reason:"}
                    </strong>{" "}
                    {entry.rejectionReason}
                  </p>
                ) : null}
                {entry.reviewedBy ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Reviewed by {entry.reviewedBy.fullName}
                  </p>
                ) : null}
              </div>

              {mode === "manager" ? (
                <ManagerActions entry={entry} />
              ) : entry.status === "PENDING" ? (
                <form action={cancelMyOvertimeEntryAction.bind(null, entry.id)}>
                  <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                    <X size={16} aria-hidden="true" />
                    Cancel entry
                  </button>
                </form>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ManagerActions({ entry }: { entry: OvertimeRecord }) {
  if (entry.status === "PENDING") {
    return (
      <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[420px]">
        <form action={approveOvertimeEntryAction.bind(null, entry.id)}>
          <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
            <Check size={16} aria-hidden="true" />
            Approve
          </button>
        </form>
        <form
          action={rejectOvertimeEntryAction.bind(null, entry.id)}
          className="grid gap-2"
        >
          <input
            name="rejectionReason"
            placeholder="Rejection reason (optional)"
            className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700"
          />
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50">
            <X size={16} aria-hidden="true" />
            Reject
          </button>
        </form>
      </div>
    );
  }

  if (entry.status === "APPROVED") {
    return (
      <form
        action={reverseOvertimeApprovalAction.bind(null, entry.id)}
        className="grid gap-2 lg:min-w-72"
      >
        <input
          name="rejectionReason"
          required
          placeholder="Reversal reason"
          className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700"
        />
        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          <RotateCcw size={16} aria-hidden="true" />
          Reverse approval
        </button>
      </form>
    );
  }

  return null;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="block text-slate-500">{label}</span>
      <strong className="font-mono">{value.toFixed(2)}h</strong>
    </div>
  );
}

function statusTone(status: OvertimeRequest["status"]) {
  const base = "rounded-md px-2 py-1 text-xs font-semibold";

  switch (status) {
    case "PENDING":
      return `${base} bg-amber-50 text-amber-800`;
    case "APPROVED":
      return `${base} bg-emerald-50 text-emerald-800`;
    case "REJECTED":
      return `${base} bg-rose-50 text-rose-800`;
    case "REVERSED":
      return `${base} bg-sky-50 text-sky-800`;
    default:
      return `${base} bg-slate-100 text-slate-600`;
  }
}
