import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPayrollReport } from "../../src/lib/payroll/calculations";
import { payrollReportToCsv } from "../../src/lib/payroll/csv";
import { calculateExpectedHoursForPeriod } from "../../src/lib/payroll/period";
import type {
  BuildPayrollReportInput,
  PayrollEmployeeInput,
} from "../../src/lib/payroll/types";

const employee: PayrollEmployeeInput = {
  id: "emp-1",
  fullName: "Ava Allergy",
  email: "ava@example.com",
  status: "ACTIVE",
  ptoBalanceHours: 40,
  expectedWeeklyHours: 40,
  compTimeBalanceHours: 0,
  availability: [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startMinute: 8 * 60,
    endMinute: 17 * 60,
    effectiveStartDate: "2026-01-01",
    active: true,
  })),
};

const baseInput: BuildPayrollReportInput = {
  startDate: "2026-06-01",
  endDate: "2026-06-14",
  employees: [employee],
  scheduleDays: [],
  ptoRequests: [],
  nptoRequests: [],
  paidHolidays: [],
  ledgerEntries: [],
  settings: {
    defaultPayrollPeriodDays: 14,
    fullTimeWeeklyHours: 40,
    paidHolidayDefaultHours: 8,
    compTimeBankingEnabled: false,
    bankOverExpectedHours: false,
    deductUnderExpectedHours: false,
    flagUnderExpectedHours: true,
  },
};

describe("payroll calculations", () => {
  it("calculates scheduled work hours from task slot times", () => {
    const report = buildPayrollReport({
      ...baseInput,
      scheduleDays: [
        scheduleDay({
          date: "2026-06-01",
          status: "PUBLISHED",
          startMinute: 8 * 60,
          endMinute: 16 * 60,
        }),
      ],
    });

    assert.equal(report.rows[0].scheduledWorkHours, 8);
    assert.equal(report.rows[0].assignmentCount, 1);
  });

  it("counts approved PTO hours and ignores reversed PTO for paid hours", () => {
    const report = buildPayrollReport({
      ...baseInput,
      ptoRequests: [
        {
          id: "pto-approved",
          employeeId: employee.id,
          status: "APPROVED",
          startDate: "2026-06-02",
          endDate: "2026-06-02",
        },
        {
          id: "pto-reversed",
          employeeId: employee.id,
          status: "REVERSED",
          startDate: "2026-06-03",
          endDate: "2026-06-03",
        },
      ],
    });

    assert.equal(report.rows[0].ptoHours, 8);
    assert.ok(
      report.rows[0].warningCodes.includes("REVERSED_OR_CANCELLED_TIME_OFF"),
    );
  });

  it("calculates NPTO unpaid deductions and removes reversed NPTO", () => {
    const report = buildPayrollReport({
      ...baseInput,
      nptoRequests: [
        {
          id: "npto-approved",
          employeeId: employee.id,
          status: "APPROVED",
          startDate: "2026-06-04",
          endDate: "2026-06-04",
          requestedHours: 8,
          unpaidHours: 8,
        },
        {
          id: "npto-reversed",
          employeeId: employee.id,
          status: "REVERSED",
          startDate: "2026-06-05",
          endDate: "2026-06-05",
          requestedHours: 8,
          unpaidHours: 0,
        },
      ],
    });

    assert.equal(report.rows[0].nptoUnpaidHours, 8);
    assert.equal(report.rows[0].finalPaidHoursEstimate, -8);
    assert.ok(
      report.rows[0].warningCodes.includes("REVERSED_OR_CANCELLED_TIME_OFF"),
    );
  });

  it("calculates biweekly expected hours from weekly expected hours", () => {
    assert.equal(
      calculateExpectedHoursForPeriod({
        expectedWeeklyHours: 40,
        periodDays: 14,
      }),
      80,
    );
  });

  it("counts paid holidays for employees normally working that weekday", () => {
    const report = buildPayrollReport({
      ...baseInput,
      paidHolidays: [
        {
          id: "holiday",
          date: "2026-06-01",
          name: "Clinic Holiday",
          hours: 8,
          rule: "PAID_HOLIDAY",
          active: true,
        },
      ],
    });

    assert.equal(report.rows[0].paidHolidayHours, 8);
  });

  it("banks overage as comp time when the setting is enabled", () => {
    const report = buildPayrollReport({
      ...baseInput,
      scheduleDays: [
        scheduleDay({
          date: "2026-06-01",
          status: "PUBLISHED",
          startMinute: 8 * 60,
          endMinute: 18 * 60,
        }),
        scheduleDay({
          date: "2026-06-02",
          status: "PUBLISHED",
          startMinute: 8 * 60,
          endMinute: 18 * 60,
        }),
        scheduleDay({
          date: "2026-06-03",
          status: "PUBLISHED",
          startMinute: 8 * 60,
          endMinute: 18 * 60,
        }),
        scheduleDay({
          date: "2026-06-04",
          status: "PUBLISHED",
          startMinute: 8 * 60,
          endMinute: 18 * 60,
        }),
        scheduleDay({
          date: "2026-06-05",
          status: "PUBLISHED",
          startMinute: 8 * 60,
          endMinute: 18 * 60,
        }),
        scheduleDay({
          date: "2026-06-08",
          status: "PUBLISHED",
          startMinute: 8 * 60,
          endMinute: 18 * 60,
        }),
        scheduleDay({
          date: "2026-06-09",
          status: "PUBLISHED",
          startMinute: 8 * 60,
          endMinute: 18 * 60,
        }),
        scheduleDay({
          date: "2026-06-10",
          status: "PUBLISHED",
          startMinute: 8 * 60,
          endMinute: 18 * 60,
        }),
        scheduleDay({
          date: "2026-06-11",
          status: "PUBLISHED",
          startMinute: 8 * 60,
          endMinute: 18 * 60,
        }),
      ],
      settings: {
        ...baseInput.settings,
        compTimeBankingEnabled: true,
        bankOverExpectedHours: true,
      },
    });

    assert.equal(report.rows[0].scheduledWorkHours, 90);
    assert.equal(report.rows[0].compTimeCreditHours, 10);
    assert.equal(report.rows[0].finalPaidHoursEstimate, 80);
  });

  it("exports a stable CSV header and row", () => {
    const report = buildPayrollReport({
      ...baseInput,
      ptoRequests: [
        {
          id: "pto-approved",
          employeeId: employee.id,
          status: "APPROVED",
          startDate: "2026-06-02",
          endDate: "2026-06-02",
        },
      ],
    });
    const csv = payrollReportToCsv(report);

    assert.match(csv, /^Employee,Email,Expected Hours/);
    assert.match(csv, /Ava Allergy,ava@example\.com,80\.00/);
  });

  it("flags missing, unpublished, shortage, and manual override schedule data", () => {
    const report = buildPayrollReport({
      ...baseInput,
      scheduleDays: [
        scheduleDay({
          date: "2026-06-01",
          status: "DRAFT",
          slotStatus: "SHORTAGE",
          locked: true,
        }),
      ],
    });
    const warningCodes = new Set(report.warnings.map((warning) => warning.code));

    assert.ok(warningCodes.has("MISSING_SCHEDULE_DATA"));
    assert.ok(warningCodes.has("UNPUBLISHED_SCHEDULE"));
    assert.ok(warningCodes.has("UNRESOLVED_SHORTAGE"));
    assert.ok(report.rows[0].warningCodes.includes("MANUAL_OVERRIDE"));
  });
});

function scheduleDay(input: {
  date: string;
  status: string;
  startMinute?: number;
  endMinute?: number;
  slotStatus?: string;
  locked?: boolean;
}) {
  return {
    id: `schedule-${input.date}`,
    date: input.date,
    status: input.status,
    scenario: "ROUTINE",
    taskSlots: [
      {
        id: `slot-${input.date}`,
        taskTypeName: "Front Desk",
        startMinute: input.startMinute ?? 8 * 60,
        endMinute: input.endMinute ?? 17 * 60,
        status: input.slotStatus ?? "FILLED",
        requirementLevel: "REQUIRED",
        assignments: [
          {
            id: `assignment-${input.date}`,
            employeeId: employee.id,
            source: input.locked ? "MANUAL_OVERRIDE" : "GENERATED",
            status: "ACTIVE",
            locked: Boolean(input.locked),
          },
        ],
      },
    ],
  };
}
