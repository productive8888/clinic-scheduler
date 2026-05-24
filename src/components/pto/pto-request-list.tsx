import type { Employee, PTORequest } from "@prisma/client";
import { CalendarX, Check, X } from "lucide-react";
import {
  approvePtoRequestAction,
  rejectPtoRequestAction,
} from "@/app/(app)/admin/pto/actions";
import { cancelMyPtoRequestAction } from "@/app/(app)/employee/actions";
import { ShortNoticeBadge } from "@/components/ui/short-notice-badge";
import { formatDisplayDate } from "@/lib/utils/date";
import { formatMinuteOfDay } from "@/lib/utils/time";

type PTORequestRecord = PTORequest & {
  employee: Employee;
  reviewedBy: Employee | null;
};

type PTORequestListProps = {
  requests: PTORequestRecord[];
  mode: "employee" | "manager";
};

const statusStyles = {
  PENDING: "bg-amber-50 text-amber-800",
  APPROVED: "bg-emerald-50 text-emerald-800",
  REJECTED: "bg-rose-50 text-rose-800",
  CANCELLED: "bg-slate-100 text-slate-600",
};

export function PTORequestList({ requests, mode }: PTORequestListProps) {
  if (requests.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        No PTO or unavailability requests yet.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {requests.map((request) => (
        <article
          key={request.id}
          className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-950">
                  {mode === "manager"
                    ? request.employee.fullName
                    : formatEnumLabel(request.type)}
                </h3>
                <span
                  className={`rounded-md px-2 py-1 text-xs font-semibold ${statusStyles[request.status]}`}
                >
                  {formatStatusLabel(request)}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                  {formatEnumLabel(request.type)}
                </span>
                {request.shortNotice ? <ShortNoticeBadge /> : null}
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <CalendarX size={16} aria-hidden="true" />
                {formatDisplayDate(request.startDate)} to{" "}
                {formatDisplayDate(request.endDate)}
                {formatTimeRange(request)}
              </p>
              {request.reason ? (
                <p className="mt-2 text-sm text-slate-500">{request.reason}</p>
              ) : null}
              {request.managerNote ? (
                <p className="mt-2 rounded-md bg-slate-50 p-2 text-sm text-slate-600">
                  <span className="font-semibold text-slate-800">
                    {request.status === "REJECTED" ? "Decision reason: " : "Manager note: "}
                  </span>
                  {request.managerNote}
                </p>
              ) : null}
              {request.status === "PENDING" ? (
                <p className="mt-2 text-xs text-amber-700">
                  Awaiting manager review.
                </p>
              ) : null}
              {request.status === "APPROVED" &&
              (request.type === "SICK" || request.type === "EMERGENCY") ? (
                <p className="mt-2 text-xs text-emerald-700">
                  Auto-approved and included as schedule unavailability.
                </p>
              ) : null}
              {request.reviewedBy ? (
                <p className="mt-2 text-xs text-slate-500">
                  Reviewed by {request.reviewedBy.fullName}
                </p>
              ) : null}
            </div>

            {mode === "manager" && request.status === "PENDING" ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:min-w-96">
                <form
                  action={approvePtoRequestAction.bind(null, request.id)}
                  className="grid gap-2"
                >
                  <input
                    name="managerNote"
                    placeholder="Approval note"
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
                  />
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800">
                    <Check size={16} aria-hidden="true" />
                    Approve
                  </button>
                </form>
                <form
                  action={rejectPtoRequestAction.bind(null, request.id)}
                  className="grid gap-2"
                >
                  <input
                    name="managerNote"
                    placeholder="Rejection note"
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-rose-700"
                  />
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-rose-200 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50">
                    <X size={16} aria-hidden="true" />
                    Reject
                  </button>
                </form>
              </div>
            ) : null}

            {mode === "employee" && request.status === "PENDING" ? (
              <form action={cancelMyPtoRequestAction.bind(null, request.id)}>
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  <X size={16} aria-hidden="true" />
                  Cancel request
                </button>
              </form>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function formatTimeRange(request: PTORequest) {
  const start = formatMinuteOfDay(request.startMinute);
  const end = formatMinuteOfDay(request.endMinute);

  return start && end ? `, ${start}-${end}` : "";
}

function formatStatusLabel(request: PTORequest) {
  if (
    request.status === "APPROVED" &&
    (request.type === "SICK" || request.type === "EMERGENCY")
  ) {
    return "AUTO-APPROVED";
  }

  return request.status;
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
