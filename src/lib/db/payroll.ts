import { Prisma, type HolidayPayRule, type PayrollAdjustmentType } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { buildPayrollReport } from "@/lib/payroll/calculations";
import type { PayrollSettingsInput } from "@/lib/payroll/types";
import { parseIsoDate, toIsoDate } from "@/lib/utils/date";

export async function getPayrollSettings() {
  return getDb().payrollSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}

export async function updatePayrollSettings(input: {
  values: PayrollSettingsInput;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await getPayrollSettings();
  const settings = await db.payrollSettings.update({
    where: { id: "default" },
    data: input.values,
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "payroll_settings.update",
    entityType: "PayrollSettings",
    entityId: settings.id,
    before,
    after: settings,
  });

  return settings;
}

export async function getPayrollAdminPageData(input: {
  startDate: string;
  endDate: string;
}) {
  const [settings, holidays, report] = await Promise.all([
    getPayrollSettings(),
    getDb().paidHoliday.findMany({
      orderBy: [{ date: "asc" }, { name: "asc" }],
    }),
    getPayrollReport(input),
  ]);

  return { settings, holidays, report };
}

export async function getPayrollReport(input: {
  startDate: string;
  endDate: string;
}) {
  const db = getDb();
  const start = parseIsoDate(input.startDate);
  const end = parseIsoDate(input.endDate);

  const [
    settings,
    employees,
    scheduleDays,
    ptoRequests,
    nptoRequests,
    paidHolidays,
    ledgerEntries,
  ] = await Promise.all([
    getPayrollSettings(),
    db.employee.findMany({
      orderBy: [{ status: "asc" }, { fullName: "asc" }],
      include: {
        availability: {
          where: { active: true },
          orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
        },
      },
    }),
    db.scheduleDay.findMany({
      where: {
        date: { gte: start, lte: end },
      },
      orderBy: { date: "asc" },
      include: {
        taskSlots: {
          where: { status: { not: "CANCELLED" } },
          orderBy: [
            { taskType: { sortOrder: "asc" } },
            { slotIndex: "asc" },
          ],
          include: {
            taskType: true,
            assignments: {
              where: { status: "ACTIVE" },
              orderBy: [{ assignedAt: "asc" }, { id: "asc" }],
            },
          },
        },
      },
    }),
    db.pTORequest.findMany({
      where: {
        startDate: { lte: end },
        endDate: { gte: start },
      },
    }),
    db.nPTORequest.findMany({
      where: {
        startDate: { lte: end },
        endDate: { gte: start },
      },
    }),
    db.paidHoliday.findMany({
      where: {
        active: true,
        date: { gte: start, lte: end },
      },
    }),
    db.payrollAdjustmentLedger.findMany({
      where: {
        effectiveDate: { gte: start, lte: end },
      },
      orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  return buildPayrollReport({
    startDate: input.startDate,
    endDate: input.endDate,
    settings: {
      defaultPayrollPeriodDays: settings.defaultPayrollPeriodDays,
      fullTimeWeeklyHours: Number(settings.fullTimeWeeklyHours),
      paidHolidayDefaultHours: Number(settings.paidHolidayDefaultHours),
      compTimeBankingEnabled: settings.compTimeBankingEnabled,
      bankOverExpectedHours: settings.bankOverExpectedHours,
      deductUnderExpectedHours: settings.deductUnderExpectedHours,
      flagUnderExpectedHours: settings.flagUnderExpectedHours,
    },
    employees: employees.map((employee) => ({
      id: employee.id,
      fullName: employee.fullName,
      email: employee.email,
      status: employee.status,
      ptoBalanceHours: Number(employee.ptoBalanceHours),
      expectedWeeklyHours: Number(employee.expectedWeeklyHours),
      compTimeBalanceHours: Number(employee.compTimeBalanceHours),
      availability: employee.availability.map((availability) => ({
        weekday: availability.weekday,
        startMinute: availability.startMinute,
        endMinute: availability.endMinute,
        effectiveStartDate: toIsoDate(availability.effectiveStartDate),
        effectiveEndDate: availability.effectiveEndDate
          ? toIsoDate(availability.effectiveEndDate)
          : null,
        active: availability.active,
      })),
    })),
    scheduleDays: scheduleDays.map((scheduleDay) => ({
      id: scheduleDay.id,
      date: toIsoDate(scheduleDay.date),
      status: scheduleDay.status,
      scenario: scheduleDay.scenario,
      taskSlots: scheduleDay.taskSlots.map((slot) => ({
        id: slot.id,
        taskTypeName: slot.taskType.name,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
        status: slot.status,
        requirementLevel: slot.requirementLevel,
        assignments: slot.assignments.map((assignment) => ({
          id: assignment.id,
          employeeId: assignment.employeeId,
          source: assignment.source,
          status: assignment.status,
          locked: assignment.locked,
        })),
      })),
    })),
    ptoRequests: ptoRequests.map((request) => ({
      id: request.id,
      employeeId: request.employeeId,
      status: request.status,
      type: request.type,
      startDate: toIsoDate(request.startDate),
      endDate: toIsoDate(request.endDate),
      startMinute: request.startMinute,
      endMinute: request.endMinute,
    })),
    nptoRequests: nptoRequests.map((request) => ({
      id: request.id,
      employeeId: request.employeeId,
      status: request.status,
      startDate: toIsoDate(request.startDate),
      endDate: toIsoDate(request.endDate),
      startMinute: request.startMinute,
      endMinute: request.endMinute,
      requestedHours: Number(request.requestedHours),
      unpaidHours: Number(request.unpaidHours),
    })),
    paidHolidays: paidHolidays.map((holiday) => ({
      id: holiday.id,
      date: toIsoDate(holiday.date),
      name: holiday.name,
      hours: Number(holiday.hours),
      rule: holiday.rule,
      active: holiday.active,
    })),
    ledgerEntries: ledgerEntries.map((entry) => ({
      id: entry.id,
      employeeId: entry.employeeId,
      type: entry.type,
      hours: Number(entry.hours),
      effectiveDate: toIsoDate(entry.effectiveDate),
      sourceEntityType: entry.sourceEntityType,
      sourceEntityId: entry.sourceEntityId,
      notes: entry.notes,
    })),
  });
}

export async function createPaidHoliday(input: {
  date: string;
  name: string;
  hours: number;
  rule: HolidayPayRule;
  notes?: string | null;
  actorEmployeeId?: string | null;
}) {
  const holiday = await getDb().paidHoliday.upsert({
    where: { date: parseIsoDate(input.date) },
    update: {
      name: input.name,
      hours: input.hours,
      rule: input.rule,
      active: true,
      notes: input.notes,
      createdByEmployeeId: input.actorEmployeeId ?? null,
    },
    create: {
      date: parseIsoDate(input.date),
      name: input.name,
      hours: input.hours,
      rule: input.rule,
      notes: input.notes,
      createdByEmployeeId: input.actorEmployeeId ?? null,
    },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "paid_holiday.upsert",
    entityType: "PaidHoliday",
    entityId: holiday.id,
    after: holiday,
  });

  return holiday;
}

export async function deactivatePaidHoliday(input: {
  holidayId: string;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await db.paidHoliday.findUniqueOrThrow({
    where: { id: input.holidayId },
  });
  const holiday = await db.paidHoliday.update({
    where: { id: input.holidayId },
    data: { active: false },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "paid_holiday.deactivate",
    entityType: "PaidHoliday",
    entityId: holiday.id,
    before,
    after: holiday,
  });

  return holiday;
}

export async function recordPayrollLedgerEntry(input: {
  employeeId: string;
  type: PayrollAdjustmentType;
  hours: number;
  effectiveDate: string;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  periodStartDate?: string | null;
  periodEndDate?: string | null;
  createdByEmployeeId?: string | null;
  metadata?: Record<string, unknown> | null;
  notes?: string | null;
}) {
  const data = {
    employeeId: input.employeeId,
    type: input.type,
    hours: input.hours,
    effectiveDate: parseIsoDate(input.effectiveDate),
    periodStartDate: input.periodStartDate
      ? parseIsoDate(input.periodStartDate)
      : null,
    periodEndDate: input.periodEndDate ? parseIsoDate(input.periodEndDate) : null,
    sourceEntityType: input.sourceEntityType ?? null,
    sourceEntityId: input.sourceEntityId ?? null,
    createdByEmployeeId: input.createdByEmployeeId ?? null,
    metadata: input.metadata
      ? (input.metadata as Prisma.InputJsonObject)
      : undefined,
    notes: input.notes ?? null,
  };

  if (input.sourceEntityType && input.sourceEntityId) {
    return getDb().payrollAdjustmentLedger.upsert({
      where: {
        employeeId_type_sourceEntityType_sourceEntityId: {
          employeeId: input.employeeId,
          type: input.type,
          sourceEntityType: input.sourceEntityType,
          sourceEntityId: input.sourceEntityId,
        },
      },
      update: data,
      create: data,
    });
  }

  return getDb().payrollAdjustmentLedger.create({ data });
}
