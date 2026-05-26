import { Banknote, CalendarPlus, Download, Settings2 } from "lucide-react";
import Link from "next/link";
import {
  createPaidHolidayAction,
  deactivatePaidHolidayAction,
  updatePayrollSettingsAction,
} from "./actions";
import { SetupRequired } from "@/components/layout/setup-required";
import { getPayrollAdminPageData } from "@/lib/db/payroll";
import { getPayrollPeriodContaining } from "@/lib/payroll/period";
import type { PayrollReportRow } from "@/lib/payroll/types";
import { toIsoDate } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string | string[]; endDate?: string | string[] }>;
}) {
  const params = await searchParams;
  const defaultPeriod = getPayrollPeriodContaining(new Date());
  const startDate = dateParam(params.startDate) ?? defaultPeriod.startDate;
  const endDate = dateParam(params.endDate) ?? defaultPeriod.endDate;

  let data: Awaited<ReturnType<typeof getPayrollAdminPageData>>;

  try {
    data = await getPayrollAdminPageData({ startDate, endDate });
  } catch (error) {
    return (
      <SetupRequired
        title="Connect PostgreSQL before viewing payroll reports"
        message="Set DATABASE_URL, run the Prisma migration and seed, then refresh this page."
        detail={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  const exportHref = `/api/exports/payroll?startDate=${encodeURIComponent(
    startDate,
  )}&endDate=${encodeURIComponent(endDate)}`;

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
          Payroll reports
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          Review payroll estimates
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Generate manager-reviewable summaries from schedules, PTO, NPTO,
          holidays, and adjustment ledger entries. CSV export is a file download
          only; nothing is submitted to payroll.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 font-semibold text-slate-700">
            <Banknote size={16} aria-hidden="true" />
            {formatNumber(data.report.totals.finalPaidHoursEstimate)} estimated paid hours
          </span>
          <span className="rounded-md bg-amber-50 px-3 py-2 font-semibold text-amber-800">
            {data.report.warnings.length} warnings
          </span>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <form
          className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]"
          action="/admin/payroll"
        >
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Start date
            <input
              type="date"
              name="startDate"
              defaultValue={startDate}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            End date
            <input
              type="date"
              name="endDate"
              defaultValue={endDate}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
            />
          </label>
          <button className="h-10 self-end rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
            Generate
          </button>
          <Link
            href={exportHref}
            className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <Download size={16} aria-hidden="true" />
            Export CSV
          </Link>
        </form>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <PayrollSettingsForm settings={data.settings} />
        <PaidHolidayPanel holidays={data.holidays} />
      </section>

      <section className="rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-950">
            Employee payroll summary
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Period: {startDate} to {endDate}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-normal text-slate-500">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Expected</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">PTO</th>
                <th className="px-4 py-3">NPTO</th>
                <th className="px-4 py-3">Holiday</th>
                <th className="px-4 py-3">Comp +</th>
                <th className="px-4 py-3">Comp -</th>
                <th className="px-4 py-3">Final paid</th>
                <th className="px-4 py-3">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.report.rows.map((row) => (
                <PayrollRow key={row.employeeId} row={row} />
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <tr>
                <td className="px-4 py-3">Totals</td>
                <td className="px-4 py-3">{formatNumber(data.report.totals.expectedHours)}</td>
                <td className="px-4 py-3">{formatNumber(data.report.totals.scheduledWorkHours)}</td>
                <td className="px-4 py-3">{formatNumber(data.report.totals.ptoHours)}</td>
                <td className="px-4 py-3">{formatNumber(data.report.totals.nptoUnpaidHours)}</td>
                <td className="px-4 py-3">{formatNumber(data.report.totals.paidHolidayHours)}</td>
                <td className="px-4 py-3">{formatNumber(data.report.totals.compTimeCreditHours)}</td>
                <td className="px-4 py-3">{formatNumber(data.report.totals.compTimeDebitHours)}</td>
                <td className="px-4 py-3">{formatNumber(data.report.totals.finalPaidHoursEstimate)}</td>
                <td className="px-4 py-3">{data.report.warnings.length}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Warnings</h2>
        <div className="mt-3 grid gap-2">
          {data.report.warnings.length ? (
            data.report.warnings.slice(0, 80).map((warning, index) => (
              <div
                key={`${warning.code}-${warning.entityId ?? warning.date ?? index}-${index}`}
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              >
                <span className="font-semibold">{warning.code}</span>
                <span className="mx-2">/</span>
                {warning.message}
              </div>
            ))
          ) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              No warnings for this report range.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PayrollSettingsForm({
  settings,
}: {
  settings: {
    defaultPayrollPeriodDays: number;
    fullTimeWeeklyHours: unknown;
    paidHolidayDefaultHours: unknown;
    compTimeBankingEnabled: boolean;
    bankOverExpectedHours: boolean;
    deductUnderExpectedHours: boolean;
    flagUnderExpectedHours: boolean;
  };
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Settings2 className="text-emerald-700" size={20} aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-950">Payroll settings</h2>
      </div>
      <form action={updatePayrollSettingsAction} className="mt-4 grid gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField
            name="defaultPayrollPeriodDays"
            label="Period days"
            defaultValue={settings.defaultPayrollPeriodDays}
          />
          <NumberField
            name="fullTimeWeeklyHours"
            label="Full-time weekly"
            defaultValue={Number(settings.fullTimeWeeklyHours)}
          />
          <NumberField
            name="paidHolidayDefaultHours"
            label="Holiday hours"
            defaultValue={Number(settings.paidHolidayDefaultHours)}
          />
        </div>
        <CheckboxField
          name="flagUnderExpectedHours"
          label="Flag employees below expected hours"
          defaultChecked={settings.flagUnderExpectedHours}
        />
        <CheckboxField
          name="compTimeBankingEnabled"
          label="Enable comp-time banking calculations"
          defaultChecked={settings.compTimeBankingEnabled}
        />
        <CheckboxField
          name="bankOverExpectedHours"
          label="Bank hours above expected as comp time"
          defaultChecked={settings.bankOverExpectedHours}
        />
        <CheckboxField
          name="deductUnderExpectedHours"
          label="Record comp-time debit for hours below expected"
          defaultChecked={settings.deductUnderExpectedHours}
        />
        <button className="h-10 w-fit rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
          Save settings
        </button>
      </form>
    </section>
  );
}

function PaidHolidayPanel({
  holidays,
}: {
  holidays: Array<{
    id: string;
    date: Date;
    name: string;
    hours: unknown;
    rule: string;
    active: boolean;
    notes: string | null;
  }>;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <CalendarPlus className="text-emerald-700" size={20} aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-950">Paid holidays</h2>
      </div>
      <form action={createPaidHolidayAction} className="mt-4 grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Date
            <input
              type="date"
              name="date"
              required
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Name
            <input
              name="name"
              required
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
            />
          </label>
          <NumberField name="hours" label="Hours" defaultValue={8} />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Rule
            <select
              name="rule"
              defaultValue="PAID_HOLIDAY"
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
            >
              <option value="PAID_HOLIDAY">Paid holiday</option>
              <option value="BANK_AS_COMP_TIME">Bank as comp time</option>
              <option value="BANK_AS_PTO">Bank as PTO</option>
              <option value="UNPAID">Unpaid</option>
            </select>
          </label>
        </div>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Notes
          <textarea
            name="notes"
            rows={2}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none focus:border-emerald-700"
          />
        </label>
        <button className="h-10 w-fit rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
          Save holiday
        </button>
      </form>
      <div className="mt-4 grid gap-2">
        {holidays.map((holiday) => (
          <div
            key={holiday.id}
            className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm sm:grid-cols-[1fr_auto]"
          >
            <div>
              <div className="font-semibold text-slate-950">
                {holiday.name} / {toIsoDate(holiday.date)}
              </div>
              <div className="text-xs text-slate-500">
                {formatNumber(Number(holiday.hours))} hours / {holiday.rule} /{" "}
                {holiday.active ? "active" : "inactive"}
              </div>
            </div>
            {holiday.active ? (
              <form action={deactivatePaidHolidayAction.bind(null, holiday.id)}>
                <button className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                  Deactivate
                </button>
              </form>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function PayrollRow({ row }: { row: PayrollReportRow }) {
  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <div className="font-semibold text-slate-950">{row.employeeName}</div>
        <div className="text-xs text-slate-500">{row.email}</div>
      </td>
      <td className="px-4 py-3">{formatNumber(row.expectedHours)}</td>
      <td className="px-4 py-3">{formatNumber(row.scheduledWorkHours)}</td>
      <td className="px-4 py-3">{formatNumber(row.ptoHours)}</td>
      <td className="px-4 py-3">{formatNumber(row.nptoUnpaidHours)}</td>
      <td className="px-4 py-3">{formatNumber(row.paidHolidayHours)}</td>
      <td className="px-4 py-3">{formatNumber(row.compTimeCreditHours)}</td>
      <td className="px-4 py-3">{formatNumber(row.compTimeDebitHours)}</td>
      <td className="px-4 py-3 font-semibold text-slate-950">
        {formatNumber(row.finalPaidHoursEstimate)}
      </td>
      <td className="px-4 py-3">
        <div className="flex max-w-xs flex-wrap gap-1">
          {row.warningCodes.length ? (
            row.warningCodes.map((code) => (
              <span
                key={code}
                className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"
              >
                {code}
              </span>
            ))
          ) : (
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
              Clear
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

function NumberField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: number;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <input
        type="number"
        name={name}
        step="0.25"
        min="0"
        defaultValue={defaultValue}
        className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-emerald-700"
      />
    </label>
  );
}

function CheckboxField({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 accent-emerald-700"
      />
      {label}
    </label>
  );
}

function dateParam(value: string | string[] | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function formatNumber(value: number) {
  return value.toFixed(2);
}
