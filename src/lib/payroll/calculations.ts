import { FULL_DAY_PTO_HOURS } from "@/lib/pto/policy";
import {
  enumerateIsoDates,
  parseIsoDate,
  toIsoDate,
} from "@/lib/utils/date";
import { calculateExpectedHoursForPeriod, roundToTwo } from "./period";
import type {
  BuildPayrollReportInput,
  PayrollEmployeeInput,
  PayrollPaidHolidayInput,
  PayrollReportRow,
  PayrollReportSummary,
  PayrollScheduleDayInput,
  PayrollTimeOffInput,
  PayrollWarning,
} from "./types";

const PTO_FLOOR_HOURS = -24;
const SCHEDULE_BLOCKING_STATUSES = new Set(["APPROVED", "OVERRIDDEN"]);
const HISTORICAL_TIME_OFF_STATUSES = new Set(["REVERSED", "CANCELLED"]);

export function buildPayrollReport(
  input: BuildPayrollReportInput,
): PayrollReportSummary {
  const periodDates = enumerateIsoDates(input.startDate, input.endDate);
  const rowsByEmployee = new Map<string, PayrollReportRow>();
  const warnings: PayrollWarning[] = [];

  for (const employee of input.employees) {
    rowsByEmployee.set(employee.id, {
      employeeId: employee.id,
      employeeName: employee.fullName,
      email: employee.email,
      expectedHours: calculateExpectedHoursForPeriod({
        expectedWeeklyHours: employee.expectedWeeklyHours,
        periodDays: periodDates.length,
      }),
      scheduledWorkHours: 0,
      ptoHours: 0,
      nptoUnpaidHours: 0,
      paidHolidayHours: 0,
      holidayCompTimeHours: 0,
      holidayPtoCreditHours: 0,
      manualAdjustmentHours: 0,
      compTimeCreditHours: 0,
      compTimeDebitHours: 0,
      finalPaidHoursEstimate: 0,
      assignmentCount: 0,
      ptoRequestCount: 0,
      nptoRequestCount: 0,
      manualOverrideCount: 0,
      warningCodes: [],
    });
  }

  applyScheduleHours({
    scheduleDays: input.scheduleDays,
    periodDates,
    rowsByEmployee,
    warnings,
  });

  applyMissingScheduleWarnings({
    employees: input.employees,
    scheduleDays: input.scheduleDays,
    periodDates,
    warnings,
  });

  for (const request of input.ptoRequests) {
    const row = rowsByEmployee.get(request.employeeId);

    if (!row) {
      continue;
    }

    if (SCHEDULE_BLOCKING_STATUSES.has(request.status)) {
      row.ptoHours += requestHoursInRange(request, input.startDate, input.endDate);
      row.ptoRequestCount += 1;
      continue;
    }

    if (HISTORICAL_TIME_OFF_STATUSES.has(request.status)) {
      addEmployeeWarning(row, warnings, {
        code: "REVERSED_OR_CANCELLED_TIME_OFF",
        message: `${row.employeeName} has ${request.status.toLowerCase()} PTO in this payroll period.`,
        employeeId: row.employeeId,
        entityId: request.id,
      });
    }
  }

  for (const request of input.nptoRequests) {
    const row = rowsByEmployee.get(request.employeeId);

    if (!row) {
      continue;
    }

    if (SCHEDULE_BLOCKING_STATUSES.has(request.status)) {
      row.nptoUnpaidHours += request.unpaidHours || request.requestedHours;
      row.nptoRequestCount += 1;
      continue;
    }

    if (HISTORICAL_TIME_OFF_STATUSES.has(request.status)) {
      addEmployeeWarning(row, warnings, {
        code: "REVERSED_OR_CANCELLED_TIME_OFF",
        message: `${row.employeeName} has ${request.status.toLowerCase()} NPTO in this payroll period.`,
        employeeId: row.employeeId,
        entityId: request.id,
      });
    }
  }

  for (const holiday of input.paidHolidays) {
    if (!holiday.active) {
      continue;
    }

    for (const employee of input.employees) {
      if (!employeeWorksDate(employee, holiday.date)) {
        continue;
      }

      const row = rowsByEmployee.get(employee.id);

      if (!row) {
        continue;
      }

      applyHolidayToRow(row, holiday);
    }
  }

  for (const entry of input.ledgerEntries) {
    const row = rowsByEmployee.get(entry.employeeId);

    if (!row) {
      continue;
    }

    switch (entry.type) {
      case "MANUAL_ADJUSTMENT":
        row.manualAdjustmentHours += entry.hours;
        break;
      case "COMP_TIME_CREDIT":
        row.compTimeCreditHours += Math.abs(entry.hours);
        break;
      case "COMP_TIME_DEBIT":
        row.compTimeDebitHours += Math.abs(entry.hours);
        break;
      case "PAID_HOLIDAY_CREDIT":
        row.paidHolidayHours += Math.abs(entry.hours);
        break;
      case "PTO_CREDIT":
        row.holidayPtoCreditHours += Math.abs(entry.hours);
        break;
      default:
        break;
    }
  }

  for (const employee of input.employees) {
    const row = rowsByEmployee.get(employee.id);

    if (!row) {
      continue;
    }

    row.ptoHours = roundToTwo(row.ptoHours);
    row.nptoUnpaidHours = roundToTwo(row.nptoUnpaidHours);
    row.scheduledWorkHours = roundToTwo(row.scheduledWorkHours);
    row.paidHolidayHours = roundToTwo(row.paidHolidayHours);
    row.holidayCompTimeHours = roundToTwo(row.holidayCompTimeHours);
    row.holidayPtoCreditHours = roundToTwo(row.holidayPtoCreditHours);
    row.manualAdjustmentHours = roundToTwo(row.manualAdjustmentHours);

    const basePaidHours = roundToTwo(
      row.scheduledWorkHours +
        row.ptoHours +
        row.paidHolidayHours +
        row.manualAdjustmentHours -
        row.nptoUnpaidHours,
    );

    const overage = roundToTwo(Math.max(0, basePaidHours - row.expectedHours));
    const deficit = roundToTwo(Math.max(0, row.expectedHours - basePaidHours));

    if (overage > 0) {
      addEmployeeWarning(row, warnings, {
        code: "EMPLOYEE_ABOVE_EXPECTED_HOURS",
        message: `${row.employeeName} is ${overage} hours above expected paid hours.`,
        employeeId: row.employeeId,
      });
    }

    if (input.settings.flagUnderExpectedHours && deficit > 0) {
      addEmployeeWarning(row, warnings, {
        code: "EMPLOYEE_BELOW_EXPECTED_HOURS",
        message: `${row.employeeName} is ${deficit} hours below expected paid hours.`,
        employeeId: row.employeeId,
      });
    }

    if (
      input.settings.compTimeBankingEnabled &&
      input.settings.bankOverExpectedHours &&
      overage > 0
    ) {
      row.compTimeCreditHours = roundToTwo(row.compTimeCreditHours + overage);
    }

    if (
      input.settings.compTimeBankingEnabled &&
      input.settings.deductUnderExpectedHours &&
      deficit > 0
    ) {
      row.compTimeDebitHours = roundToTwo(row.compTimeDebitHours + deficit);
    }

    const bankedOverage =
      input.settings.compTimeBankingEnabled && input.settings.bankOverExpectedHours
        ? overage
        : 0;

    row.finalPaidHoursEstimate = roundToTwo(basePaidHours - bankedOverage);

    if (employee.ptoBalanceHours < 0) {
      addEmployeeWarning(row, warnings, {
        code: "NEGATIVE_PTO_BALANCE",
        message: `${row.employeeName} has a negative PTO balance.`,
        employeeId: row.employeeId,
      });
    }

    if (employee.ptoBalanceHours < PTO_FLOOR_HOURS) {
      addEmployeeWarning(row, warnings, {
        code: "PTO_BELOW_FLOOR",
        message: `${row.employeeName} has PTO below ${PTO_FLOOR_HOURS} hours.`,
        employeeId: row.employeeId,
      });
    }
  }

  const rows = [...rowsByEmployee.values()].sort((left, right) =>
    left.employeeName.localeCompare(right.employeeName),
  );

  return {
    startDate: input.startDate,
    endDate: input.endDate,
    periodDays: periodDates.length,
    rows,
    warnings,
    totals: {
      expectedHours: sumRows(rows, "expectedHours"),
      scheduledWorkHours: sumRows(rows, "scheduledWorkHours"),
      ptoHours: sumRows(rows, "ptoHours"),
      nptoUnpaidHours: sumRows(rows, "nptoUnpaidHours"),
      paidHolidayHours: sumRows(rows, "paidHolidayHours"),
      compTimeCreditHours: sumRows(rows, "compTimeCreditHours"),
      compTimeDebitHours: sumRows(rows, "compTimeDebitHours"),
      finalPaidHoursEstimate: sumRows(rows, "finalPaidHoursEstimate"),
    },
  };
}

function applyScheduleHours(input: {
  scheduleDays: PayrollScheduleDayInput[];
  periodDates: string[];
  rowsByEmployee: Map<string, PayrollReportRow>;
  warnings: PayrollWarning[];
}) {
  const periodDateSet = new Set(input.periodDates);

  for (const scheduleDay of input.scheduleDays) {
    if (!periodDateSet.has(scheduleDay.date)) {
      continue;
    }

    if (scheduleDay.status !== "PUBLISHED") {
      input.warnings.push({
        code: "UNPUBLISHED_SCHEDULE",
        date: scheduleDay.date,
        entityId: scheduleDay.id,
        message: `${scheduleDay.date} is ${scheduleDay.status.toLowerCase()}, not published.`,
      });
    }

    for (const slot of scheduleDay.taskSlots) {
      if (slot.status === "SHORTAGE") {
        input.warnings.push({
          code: "UNRESOLVED_SHORTAGE",
          date: scheduleDay.date,
          entityId: slot.id,
          message: `${scheduleDay.date} has an unresolved ${slot.taskTypeName} shortage.`,
        });
      }

      const slotHours = slotHoursOrWarning({
        slotId: slot.id,
        taskTypeName: slot.taskTypeName,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
        paidHours: slot.paidHours,
        date: scheduleDay.date,
        warnings: input.warnings,
      });

      for (const assignment of slot.assignments) {
        if (assignment.status !== "ACTIVE") {
          continue;
        }

        const row = input.rowsByEmployee.get(assignment.employeeId);

        if (!row) {
          continue;
        }

        row.scheduledWorkHours += slotHours;
        row.assignmentCount += 1;

        if (assignment.locked || assignment.source === "MANUAL_OVERRIDE") {
          row.manualOverrideCount += 1;
          addEmployeeWarning(row, input.warnings, {
            code: "MANUAL_OVERRIDE",
            date: scheduleDay.date,
            entityId: assignment.id,
            message: `${row.employeeName} has a manual override on ${scheduleDay.date}.`,
          });
        }
      }
    }
  }
}

function applyMissingScheduleWarnings(input: {
  employees: PayrollEmployeeInput[];
  scheduleDays: PayrollScheduleDayInput[];
  periodDates: string[];
  warnings: PayrollWarning[];
}) {
  const scheduleDates = new Set(input.scheduleDays.map((day) => day.date));
  const normallyWorkedWeekdays = new Set<number>();

  for (const employee of input.employees) {
    for (const availability of employee.availability) {
      if (availability.active) {
        normallyWorkedWeekdays.add(availability.weekday);
      }
    }
  }

  for (const date of input.periodDates) {
    if (scheduleDates.has(date)) {
      continue;
    }

    const weekday = parseIsoDate(date).getUTCDay();

    if (!normallyWorkedWeekdays.has(weekday)) {
      continue;
    }

    input.warnings.push({
      code: "MISSING_SCHEDULE_DATA",
      date,
      message: `${date} has no schedule data for a normally staffed weekday.`,
    });
  }
}

function applyHolidayToRow(
  row: PayrollReportRow,
  holiday: PayrollPaidHolidayInput,
) {
  switch (holiday.rule) {
    case "PAID_HOLIDAY":
      row.paidHolidayHours += holiday.hours;
      break;
    case "BANK_AS_COMP_TIME":
      row.holidayCompTimeHours += holiday.hours;
      row.compTimeCreditHours += holiday.hours;
      break;
    case "BANK_AS_PTO":
      row.holidayPtoCreditHours += holiday.hours;
      break;
    default:
      break;
  }
}

function requestHoursInRange(
  request: PayrollTimeOffInput,
  rangeStartDate: string,
  rangeEndDate: string,
) {
  const startDate =
    request.startDate > rangeStartDate ? request.startDate : rangeStartDate;
  const endDate = request.endDate < rangeEndDate ? request.endDate : rangeEndDate;

  if (startDate > endDate) {
    return 0;
  }

  const dateCount = enumerateIsoDates(startDate, endDate).length;

  if (request.startMinute !== null && request.startMinute !== undefined) {
    const endMinute = request.endMinute ?? request.startMinute;
    return roundToTwo(Math.max(0, ((endMinute - request.startMinute) / 60) * dateCount));
  }

  return dateCount * FULL_DAY_PTO_HOURS;
}

function employeeWorksDate(employee: PayrollEmployeeInput, date: string) {
  const weekday = parseIsoDate(date).getUTCDay();

  return employee.availability.some((availability) => {
    if (!availability.active || availability.weekday !== weekday) {
      return false;
    }

    const startDate = toIsoDate(availability.effectiveStartDate);
    const endDate = availability.effectiveEndDate
      ? toIsoDate(availability.effectiveEndDate)
      : null;

    return startDate <= date && (!endDate || endDate >= date);
  });
}

function slotHoursOrWarning(input: {
  slotId: string;
  taskTypeName: string;
  startMinute?: number | null;
  endMinute?: number | null;
  paidHours?: number | null;
  date: string;
  warnings: PayrollWarning[];
}) {
  if (input.paidHours !== null && input.paidHours !== undefined) {
    return roundToTwo(input.paidHours);
  }

  if (
    input.startMinute === null ||
    input.startMinute === undefined ||
    input.endMinute === null ||
    input.endMinute === undefined
  ) {
    input.warnings.push({
      code: "MISSING_SLOT_TIME",
      date: input.date,
      entityId: input.slotId,
      message: `${input.taskTypeName} on ${input.date} is missing start or end time.`,
    });

    return 0;
  }

  return roundToTwo(Math.max(0, (input.endMinute - input.startMinute) / 60));
}

function addEmployeeWarning(
  row: PayrollReportRow,
  warnings: PayrollWarning[],
  warning: PayrollWarning,
) {
  warnings.push(warning);

  if (!row.warningCodes.includes(warning.code)) {
    row.warningCodes.push(warning.code);
  }
}

function sumRows(rows: PayrollReportRow[], key: keyof PayrollReportRow) {
  return roundToTwo(
    rows.reduce((total, row) => {
      const value = row[key];
      return total + (typeof value === "number" ? value : 0);
    }, 0),
  );
}
