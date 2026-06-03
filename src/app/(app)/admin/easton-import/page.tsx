import { CheckCircle2, FileSpreadsheet, TriangleAlert } from "lucide-react";
import {
  applyEastonDefaultsAction,
  saveEastonImportReviewAction,
} from "@/app/(app)/admin/easton-import/actions";
import { getEastonImportPageData } from "@/lib/db/easton-import";

export default async function EastonImportPage() {
  const { preview, reviews } = await getEastonImportPageData();
  const roleCodes = [...new Set(preview.roleDemand.map((item) => item.roleCode))]
    .filter((code) => code !== "PATIENTS")
    .sort();

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
              Easton workbook
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-950">
              Import and review scheduling defaults
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Parse the private spreadsheet, review the extracted shift grid and
              demand counts, then apply them as editable database rules.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={saveEastonImportReviewAction}>
              <button className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100">
                <FileSpreadsheet size={16} aria-hidden="true" />
                Save review
              </button>
            </form>
            <form action={applyEastonDefaultsAction}>
              <button
                disabled={!preview.workbookPath}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                Apply defaults
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Workbook" value={preview.workbookPath ? "Found" : "Missing"} />
        <Metric label="Shift templates" value={String(preview.shifts.length)} />
        <Metric label="Role demand rows" value={String(preview.roleDemand.length)} />
        <Metric label="Employee targets" value={String(preview.employeeTargets.length)} />
      </section>

      {preview.warnings.length > 0 ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 text-amber-700" size={20} />
            <div>
              <h2 className="text-base font-semibold text-amber-950">
                Review warnings
              </h2>
              <ul className="mt-2 grid gap-1 text-sm text-amber-900">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Workbook source</h2>
        <div className="mt-3 grid gap-2 text-sm text-slate-600">
          <div>
            <span className="font-medium text-slate-900">Path:</span>{" "}
            {preview.workbookPath ?? "private/easton-scheduling.xlsx not found"}
          </div>
          <div>
            <span className="font-medium text-slate-900">Modified:</span>{" "}
            {preview.workbookModifiedAt ?? "n/a"}
          </div>
          <div>
            <span className="font-medium text-slate-900">Role codes:</span>{" "}
            {roleCodes.join(", ") || "None parsed"}
          </div>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Parsed shifts</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-normal text-slate-500">
              <tr>
                <th className="py-2 pr-4">Day</th>
                <th className="py-2 pr-4">Shift</th>
                <th className="py-2 pr-4">Start</th>
                <th className="py-2 pr-4">End</th>
                <th className="py-2 pr-4">Paid</th>
                <th className="py-2 pr-4">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.shifts.map((shift) => (
                <tr key={`${shift.weekday}-${shift.label}-${shift.paidHours}`}>
                  <td className="py-2 pr-4 font-medium text-slate-900">
                    {shift.dayLabel}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{shift.label}</td>
                  <td className="py-2 pr-4 text-slate-600">
                    {formatMinute(shift.startMinute)}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">
                    {formatMinute(shift.endMinute)}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">
                    {shift.paidHours}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">
                    {shift.shiftCategory}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <PreviewTable
          title="Role demand preview"
          emptyText="No role demand parsed."
          rows={preview.roleDemand
            .filter((item) => item.sheetName === "Shifts + Hours" && !item.aggregate)
            .slice(0, 80)
            .map((item) => [
              item.roleName,
              item.roleCode,
              weekdayName(item.weekday),
              item.shiftLabel,
              String(item.count),
            ])}
          headers={["Role", "Code", "Day", "Shift", "Count"]}
        />
        <PreviewTable
          title="Employee targets preview"
          emptyText="No employee targets parsed."
          rows={preview.employeeTargets.slice(0, 80).map((item) => [
            item.employeeName,
            item.roleLabel ?? "",
            item.groupLabel ?? "",
            item.targetPatientShifts?.toString() ?? "",
            item.exposureGoals.join(", "),
          ])}
          headers={["Employee", "Role", "Group", "Patient shifts", "Exposure"]}
        />
      </section>

      <PreviewTable
        title="June reference assignment preview"
        emptyText="No June sample assignments parsed."
        rows={preview.sampleAssignments.slice(0, 100).map((item) => [
          item.employeeName,
          weekdayName(item.weekday),
          item.shiftLabel,
          item.roleName,
          item.roleCode,
        ])}
        headers={["Employee", "Day", "Shift", "Role", "Code"]}
      />

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Recent reviews</h2>
        <div className="mt-4 grid gap-3">
          {reviews.length === 0 ? (
            <p className="text-sm text-slate-500">No reviews saved yet.</p>
          ) : (
            reviews.map((review) => (
              <div
                key={review.id}
                className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm"
              >
                <div className="font-medium text-slate-950">
                  {review.status} · {review.createdAt.toISOString()}
                </div>
                <div className="mt-1 text-slate-500">
                  {review.sourcePath}
                </div>
                <div className="mt-1 text-slate-500">
                  Actor: {review.createdBy?.fullName ?? "System"}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function PreviewTable({
  title,
  headers,
  rows,
  emptyText,
}: {
  title: string;
  headers: string[];
  rows: string[][];
  emptyText: string;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-normal text-slate-500">
              <tr>
                {headers.map((header) => (
                  <th key={header} className="py-2 pr-4">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => (
                <tr key={`${row.join("-")}-${index}`}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={`${cell}-${cellIndex}`}
                      className={`py-2 pr-4 ${
                        cellIndex === 0 ? "font-medium text-slate-900" : "text-slate-600"
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatMinute(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function weekdayName(weekday: number) {
  return [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][weekday] ?? `Weekday ${weekday}`;
}
