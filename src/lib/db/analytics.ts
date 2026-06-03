import type { ClinicScenario } from "@prisma/client";
import {
  buildStaffingAnalytics,
  type AnalyticsScheduleDay,
  type AnalyticsTaskType,
} from "@/lib/analytics/staffing";
import { getDb } from "@/lib/db";
import { addDaysIsoDate, parseIsoDate, toIsoDate, todayIsoDate } from "@/lib/utils/date";

export type StaffingAnalyticsPageFilters = {
  startDate?: string;
  endDate?: string;
  employeeId?: string;
  taskTypeId?: string;
  scenario?: ClinicScenario | "";
};

export async function getStaffingAnalyticsPageData(
  filters: StaffingAnalyticsPageFilters,
) {
  const normalizedFilters = normalizeAnalyticsFilters(filters);
  const dateWhere = {
    gte: parseIsoDate(normalizedFilters.startDate),
    lte: parseIsoDate(normalizedFilters.endDate),
  };

  const [employees, taskTypes, scheduleDays, ptoRequests] = await Promise.all([
    getDb().employee.findMany({
      where: { status: { not: "DELETED" } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    getDb().taskType.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: {
        skillRequirements: {
          select: { id: true },
        },
      },
    }),
    getDb().scheduleDay.findMany({
      where: {
        date: dateWhere,
        ...(normalizedFilters.scenario
          ? { scenario: normalizedFilters.scenario }
          : {}),
      },
      orderBy: { date: "asc" },
      include: {
        taskSlots: {
          where: {
            status: { not: "CANCELLED" },
            ...(normalizedFilters.taskTypeId
              ? { taskTypeId: normalizedFilters.taskTypeId }
              : {}),
          },
          orderBy: [
            { taskType: { sortOrder: "asc" } },
            { slotIndex: "asc" },
          ],
          include: {
            taskType: {
              include: {
                skillRequirements: {
                  select: { id: true },
                },
              },
            },
            assignments: {
              include: {
                employee: {
                  select: { id: true, fullName: true },
                },
              },
            },
          },
        },
      },
    }),
    getDb().pTORequest.findMany({
      where: {
        status: { not: "CANCELLED" },
        startDate: { lte: parseIsoDate(normalizedFilters.endDate) },
        endDate: { gte: parseIsoDate(normalizedFilters.startDate) },
        ...(normalizedFilters.employeeId
          ? { employeeId: normalizedFilters.employeeId }
          : {}),
      },
      include: {
        employee: {
          select: { id: true, fullName: true },
        },
      },
    }),
  ]);

  const analytics = buildStaffingAnalytics({
    filters: {
      employeeId: normalizedFilters.employeeId || undefined,
      taskTypeId: normalizedFilters.taskTypeId || undefined,
      scenario: normalizedFilters.scenario || undefined,
    },
    employees,
    taskTypes: taskTypes.map((taskType) => toAnalyticsTaskType(taskType)),
    scheduleDays: scheduleDays.map((day) => ({
      id: day.id,
      date: toIsoDate(day.date),
      scenario: day.scenario,
      status: day.status,
      taskSlots: day.taskSlots.map((slot) => ({
        id: slot.id,
        taskTypeId: slot.taskTypeId,
        status: slot.status,
        requirementLevel: slot.requirementLevel,
        requiredStaff: slot.requiredStaff,
        shortNotice: slot.shortNotice,
        taskType: toAnalyticsTaskType(slot.taskType),
        assignments: slot.assignments.map((assignment) => ({
          id: assignment.id,
          employeeId: assignment.employeeId,
          source: assignment.source,
          status: assignment.status,
          shortNotice: assignment.shortNotice,
          employee: assignment.employee,
        })),
      })),
    })) satisfies AnalyticsScheduleDay[],
    ptoRequests: ptoRequests.map((request) => ({
      id: request.id,
      employeeId: request.employeeId,
      status: request.status,
      startDate: toIsoDate(request.startDate),
      endDate: toIsoDate(request.endDate),
      shortNotice: request.shortNotice,
      employee: request.employee,
    })),
  });

  return {
    filters: normalizedFilters,
    employees,
    taskTypes: taskTypes.map((taskType) => ({
      id: taskType.id,
      name: taskType.name,
    })),
    analytics,
  };
}

function normalizeAnalyticsFilters(filters: StaffingAnalyticsPageFilters) {
  const today = todayIsoDate();
  const startDate = safeIsoDate(filters.startDate) ?? addDaysIsoDate(today, -30);
  const endDate = safeIsoDate(filters.endDate) ?? addDaysIsoDate(today, 30);

  return {
    startDate,
    endDate: endDate < startDate ? startDate : endDate,
    employeeId: filters.employeeId ?? "",
    taskTypeId: filters.taskTypeId ?? "",
    scenario: filters.scenario ?? "",
  };
}

function safeIsoDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function toAnalyticsTaskType(
  taskType: {
    id: string;
    code: string;
    name: string;
    difficultyWeight: number;
    skillRequirements: { id: string }[];
  },
): AnalyticsTaskType {
  return {
    id: taskType.id,
    code: taskType.code,
    name: taskType.name,
    difficultyWeight: taskType.difficultyWeight,
    skillRequirementCount: taskType.skillRequirements.length,
  };
}
