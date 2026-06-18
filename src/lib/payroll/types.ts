import type {
  ClinicScenario,
  EndoscopyCompPolicy,
  HolidayPayRule,
  PayrollAdjustmentType,
  ScheduleDayStatus,
} from "@prisma/client";

export type PayrollSettingsInput = {
  defaultPayrollPeriodDays: number;
  fullTimeWeeklyHours: number;
  paidHolidayDefaultHours: number;
  compTimeBankingEnabled: boolean;
  bankOverExpectedHours: boolean;
  deductUnderExpectedHours: boolean;
  flagUnderExpectedHours: boolean;
  endoscopyExtraHoursPolicy: EndoscopyCompPolicy;
  endoscopyShortenShiftSuggestions: boolean;
};

export type PayrollEmployeeInput = {
  id: string;
  fullName: string;
  email: string;
  status: string;
  ptoBalanceHours: number;
  expectedWeeklyHours: number;
  compTimeBalanceHours: number;
  availability: PayrollAvailabilityInput[];
};

export type PayrollAvailabilityInput = {
  weekday: number;
  startMinute: number;
  endMinute: number;
  effectiveStartDate: string;
  effectiveEndDate?: string | null;
  active: boolean;
};

export type PayrollScheduleDayInput = {
  id: string;
  date: string;
  status: ScheduleDayStatus | string;
  scenario: ClinicScenario | string;
  taskSlots: PayrollTaskSlotInput[];
};

export type PayrollTaskSlotInput = {
  id: string;
  taskTypeName: string;
  startMinute?: number | null;
  endMinute?: number | null;
  paidHours?: number | null;
  isEndoscopy?: boolean;
  shiftCategory?: string | null;
  status: string;
  requirementLevel: string;
  assignments: PayrollAssignmentInput[];
};

export type PayrollAssignmentInput = {
  id: string;
  employeeId: string;
  source: string;
  status: string;
  locked: boolean;
};

export type PayrollTimeOffInput = {
  id: string;
  employeeId: string;
  status: string;
  startDate: string;
  endDate: string;
  startMinute?: number | null;
  endMinute?: number | null;
  type?: string;
};

export type PayrollNptoInput = PayrollTimeOffInput & {
  requestedHours: number;
  unpaidHours: number;
};

export type PayrollOvertimeInput = {
  id: string;
  employeeId: string;
  workDate: string;
  status: string;
  requestedHours: number;
  optoAppliedHours: number;
  payableOvertimeHours: number;
};

export type PayrollPaidHolidayInput = {
  id: string;
  date: string;
  name: string;
  hours: number;
  rule: HolidayPayRule | string;
  active: boolean;
};

export type PayrollLedgerInput = {
  id: string;
  employeeId: string;
  type: PayrollAdjustmentType | string;
  hours: number;
  effectiveDate: string;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  notes?: string | null;
};

export type PayrollWarningCode =
  | "EMPLOYEE_BELOW_EXPECTED_HOURS"
  | "EMPLOYEE_ABOVE_EXPECTED_HOURS"
  | "NEGATIVE_PTO_BALANCE"
  | "PTO_BELOW_FLOOR"
  | "MISSING_SCHEDULE_DATA"
  | "UNPUBLISHED_SCHEDULE"
  | "UNRESOLVED_SHORTAGE"
  | "MANUAL_OVERRIDE"
  | "REVERSED_OR_CANCELLED_TIME_OFF"
  | "MISSING_SLOT_TIME";

export type PayrollWarning = {
  code: PayrollWarningCode;
  message: string;
  employeeId?: string;
  date?: string;
  entityId?: string;
};

export type PayrollReportRow = {
  employeeId: string;
  employeeName: string;
  email: string;
  expectedHours: number;
  scheduledWorkHours: number;
  ptoHours: number;
  nptoUnpaidHours: number;
  approvedOvertimeRequestedHours: number;
  optoAppliedHours: number;
  payableOvertimeHours: number;
  paidHolidayHours: number;
  holidayCompTimeHours: number;
  holidayPtoCreditHours: number;
  endoscopyWorkHours: number;
  endoscopyPtoCreditHours: number;
  manualAdjustmentHours: number;
  compTimeCreditHours: number;
  compTimeDebitHours: number;
  finalPaidHoursEstimate: number;
  assignmentCount: number;
  ptoRequestCount: number;
  nptoRequestCount: number;
  overtimeEntryCount: number;
  manualOverrideCount: number;
  warningCodes: PayrollWarningCode[];
};

export type PayrollReportSummary = {
  startDate: string;
  endDate: string;
  periodDays: number;
  rows: PayrollReportRow[];
  warnings: PayrollWarning[];
  totals: {
    expectedHours: number;
    scheduledWorkHours: number;
    ptoHours: number;
    nptoUnpaidHours: number;
    approvedOvertimeRequestedHours: number;
    optoAppliedHours: number;
    payableOvertimeHours: number;
    paidHolidayHours: number;
    endoscopyPtoCreditHours: number;
    compTimeCreditHours: number;
    compTimeDebitHours: number;
    finalPaidHoursEstimate: number;
  };
};

export type BuildPayrollReportInput = {
  startDate: string;
  endDate: string;
  employees: PayrollEmployeeInput[];
  scheduleDays: PayrollScheduleDayInput[];
  ptoRequests: PayrollTimeOffInput[];
  nptoRequests: PayrollNptoInput[];
  overtimeRequests: PayrollOvertimeInput[];
  paidHolidays: PayrollPaidHolidayInput[];
  ledgerEntries: PayrollLedgerInput[];
  settings: PayrollSettingsInput;
};
