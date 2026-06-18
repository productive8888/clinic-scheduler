import type { Prisma } from "@prisma/client";
import { formatDisplayDate } from "@/lib/utils/date";

type OptoLedgerRow = Prisma.OptoLedgerEntryGetPayload<{
  include: {
    employee: { select: { id: true; fullName: true } };
    createdBy: { select: { id: true; fullName: true } };
  };
}>;

export function OptoLedgerTable({ entries }: { entries: OptoLedgerRow[] }) {
  if (entries.length === 0) {
    return (
      <div className="border-t border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
        No OPTO adjustments match these filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-normal text-slate-500">
          <tr>
            <th className="px-4 py-3">Effective</th>
            <th className="px-4 py-3">Employee</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Before</th>
            <th className="px-4 py-3">Change</th>
            <th className="px-4 py-3">After</th>
            <th className="px-4 py-3">Reason</th>
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Actor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map((entry) => (
            <tr key={entry.id} className="align-top">
              <td className="px-4 py-3 font-mono text-xs">
                {formatDisplayDate(entry.effectiveDate)}
              </td>
              <td className="px-4 py-3 font-semibold text-slate-950">
                {entry.employee.fullName}
              </td>
              <td className="px-4 py-3">{entry.adjustmentType.replaceAll("_", " ")}</td>
              <td className="px-4 py-3 font-mono">
                {Number(entry.balanceBefore).toFixed(2)}
              </td>
              <td
                className={
                  Number(entry.adjustmentHours) >= 0
                    ? "px-4 py-3 font-mono font-semibold text-emerald-700"
                    : "px-4 py-3 font-mono font-semibold text-rose-700"
                }
              >
                {Number(entry.adjustmentHours) >= 0 ? "+" : ""}
                {Number(entry.adjustmentHours).toFixed(2)}
              </td>
              <td className="px-4 py-3 font-mono font-semibold text-slate-950">
                {Number(entry.balanceAfter).toFixed(2)}
              </td>
              <td className="max-w-sm px-4 py-3 text-slate-600">{entry.reason}</td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {entry.sourceEntityType ?? "Manual"}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {entry.createdBy?.fullName ?? "System"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
