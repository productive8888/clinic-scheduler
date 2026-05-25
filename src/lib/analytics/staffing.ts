export type StaffingAnalyticsFilters = {
  employeeId?: string;
  taskTypeId?: string;
  scenario?: string;
};

export type AnalyticsEmployee = {
  id: string;
  fullName: string;
};

export type AnalyticsTaskType = {
  id: string;
  code: string;
  name: string;
  difficultyWeight: number;
  skillRequirementCount: number;
};

export type AnalyticsAssignment = {
  id: string;
  employeeId: string;
  source: string;
  status: string;
  shortNotice: boolean;
  employee: AnalyticsEmployee;
};

export type AnalyticsTaskSlot = {
  id: string;
  taskTypeId: string;
  status: string;
  requirementLevel?: string;
  requiredStaff: number;
  shortNotice: boolean;
  taskType: AnalyticsTaskType;
  assignments: AnalyticsAssignment[];
};

export type AnalyticsScheduleDay = {
  id: string;
  date: string;
  scenario: string;
  status: string;
  taskSlots: AnalyticsTaskSlot[];
};

export type AnalyticsPtoRequest = {
  id: string;
  employeeId: string;
  status: string;
  startDate: string;
  endDate: string;
  shortNotice: boolean;
  employee: AnalyticsEmployee;
};

export type BuildStaffingAnalyticsInput = {
  filters?: StaffingAnalyticsFilters;
  employees: AnalyticsEmployee[];
  taskTypes: AnalyticsTaskType[];
  scheduleDays: AnalyticsScheduleDay[];
  ptoRequests: AnalyticsPtoRequest[];
};

export type DateStaffingHealth = {
  date: string;
  scenario: string;
  status: string;
  requiredTaskSlots: number;
  filledAssignments: number;
  unfilledSlots: number;
  ptoCount: number;
  shortageConflictCount: number;
  shortNoticeCount: number;
};

export type EmployeeWorkloadStat = {
  employeeId: string;
  fullName: string;
  assignmentCount: number;
  ptoCount: number;
  difficultOrSkilledCount: number;
  taskCounts: { taskTypeId: string; taskTypeName: string; count: number }[];
};

export type TaskTypeAnalyticsStat = {
  taskTypeId: string;
  taskTypeName: string;
  frequency: number;
  understaffedCount: number;
  overrideCount: number;
  shortNoticeChangeCount: number;
};

export type TaskRoleLeader = {
  taskTypeId: string;
  taskTypeName: string;
  employeeId: string | null;
  fullName: string | null;
  count: number;
};

export function buildStaffingAnalytics(input: BuildStaffingAnalyticsInput) {
  const filters = input.filters ?? {};
  const employeeOptions = input.employees.filter(
    (employee) => !filters.employeeId || employee.id === filters.employeeId,
  );
  const taskTypeOptions = input.taskTypes.filter(
    (taskType) => !filters.taskTypeId || taskType.id === filters.taskTypeId,
  );
  const employeesById = new Map(input.employees.map((employee) => [employee.id, employee]));
  const employeeStats = new Map<string, EmployeeWorkloadStat>();
  const taskStats = new Map<string, TaskTypeAnalyticsStat>();
  const taskEmployeeCounts = new Map<string, Map<string, number>>();

  for (const employee of employeeOptions) {
    employeeStats.set(employee.id, {
      employeeId: employee.id,
      fullName: employee.fullName,
      assignmentCount: 0,
      ptoCount: 0,
      difficultOrSkilledCount: 0,
      taskCounts: [],
    });
  }

  for (const taskType of taskTypeOptions) {
    taskStats.set(taskType.id, {
      taskTypeId: taskType.id,
      taskTypeName: taskType.name,
      frequency: 0,
      understaffedCount: 0,
      overrideCount: 0,
      shortNoticeChangeCount: 0,
    });
  }

  const scheduleDays = input.scheduleDays.filter(
    (day) => !filters.scenario || day.scenario === filters.scenario,
  );
  const ptoRequests = input.ptoRequests.filter(
    (request) =>
      request.status !== "CANCELLED" &&
      (!filters.employeeId || request.employeeId === filters.employeeId),
  );

  for (const request of ptoRequests) {
    const stat = employeeStats.get(request.employeeId);

    if (stat) {
      stat.ptoCount += 1;
    }
  }

  const dateHealth = scheduleDays.map((day) => {
    const slots = filterSlots(day.taskSlots, filters);
    let filledAssignments = 0;
    let unfilledSlots = 0;
    let shortageConflictCount = 0;
    let shortNoticeCount = 0;

    for (const slot of slots) {
      const activeAssignments = filterAssignments(slot.assignments, filters).filter(
        (assignment) => assignment.status === "ACTIVE",
      );
      filledAssignments += activeAssignments.length;

      if (isRequiredSlot(slot) && activeAssignments.length < slot.requiredStaff) {
        unfilledSlots += 1;
      }

      if (isRequiredSlot(slot) && slot.status === "SHORTAGE") {
        shortageConflictCount += 1;
      }

      if (slot.shortNotice) {
        shortNoticeCount += 1;
      }

      shortNoticeCount += activeAssignments.filter(
        (assignment) => assignment.shortNotice,
      ).length;

      const taskStat = taskStats.get(slot.taskTypeId);

      if (taskStat) {
        taskStat.frequency += 1;

        if (
          isRequiredSlot(slot) &&
          (slot.status === "SHORTAGE" || activeAssignments.length < slot.requiredStaff)
        ) {
          taskStat.understaffedCount += 1;
        }

        if (slot.shortNotice) {
          taskStat.shortNoticeChangeCount += 1;
        }
      }

      for (const assignment of filterAssignments(slot.assignments, filters)) {
        if (assignment.source === "MANUAL_OVERRIDE") {
          const taskStatForOverride = taskStats.get(slot.taskTypeId);

          if (taskStatForOverride) {
            taskStatForOverride.overrideCount += 1;
          }
        }

        if (assignment.shortNotice) {
          const taskStatForShortNotice = taskStats.get(slot.taskTypeId);

          if (taskStatForShortNotice) {
            taskStatForShortNotice.shortNoticeChangeCount += 1;
          }
        }

        if (assignment.status !== "ACTIVE") {
          continue;
        }

        const employeeStat = employeeStats.get(assignment.employeeId);

        if (employeeStat) {
          employeeStat.assignmentCount += 1;
          incrementTaskCount(employeeStat, slot.taskTypeId, slot.taskType.name);

          if (
            slot.taskType.difficultyWeight > 0 ||
            slot.taskType.skillRequirementCount > 0
          ) {
            employeeStat.difficultOrSkilledCount += 1;
          }
        }

        const taskCounts =
          taskEmployeeCounts.get(slot.taskTypeId) ?? new Map<string, number>();
        taskCounts.set(
          assignment.employeeId,
          (taskCounts.get(assignment.employeeId) ?? 0) + 1,
        );
        taskEmployeeCounts.set(slot.taskTypeId, taskCounts);
      }
    }

    shortNoticeCount += ptoRequests.filter(
      (request) => request.shortNotice && isDateWithinRange(day.date, request),
    ).length;

    return {
      date: day.date,
      scenario: day.scenario,
      status: day.status,
      requiredTaskSlots: slots.filter(isRequiredSlot).length,
      filledAssignments,
      unfilledSlots,
      ptoCount: ptoRequests.filter((request) => isDateWithinRange(day.date, request))
        .length,
      shortageConflictCount,
      shortNoticeCount,
    } satisfies DateStaffingHealth;
  });

  const roleLeaders = [...taskStats.values()].map((taskStat) => {
    const counts = taskEmployeeCounts.get(taskStat.taskTypeId) ?? new Map();
    const top = [...counts.entries()].sort(
      ([leftEmployeeId, leftCount], [rightEmployeeId, rightCount]) =>
        rightCount - leftCount || leftEmployeeId.localeCompare(rightEmployeeId),
    )[0];

    return {
      taskTypeId: taskStat.taskTypeId,
      taskTypeName: taskStat.taskTypeName,
      employeeId: top?.[0] ?? null,
      fullName: top ? employeesById.get(top[0])?.fullName ?? null : null,
      count: top?.[1] ?? 0,
    } satisfies TaskRoleLeader;
  });

  const employeeWorkloads = [...employeeStats.values()]
    .map((stat) => ({
      ...stat,
      taskCounts: stat.taskCounts.sort(
        (left, right) =>
          right.count - left.count ||
          left.taskTypeName.localeCompare(right.taskTypeName),
      ),
    }))
    .sort(
      (left, right) =>
        right.assignmentCount - left.assignmentCount ||
        left.fullName.localeCompare(right.fullName),
    );

  const taskTypeStats = [...taskStats.values()].sort(
    (left, right) =>
      right.frequency - left.frequency ||
      left.taskTypeName.localeCompare(right.taskTypeName),
  );
  const shortNoticeScheduleChangeCount = scheduleDays.reduce((total, day) => {
    return (
      total +
      filterSlots(day.taskSlots, filters).reduce((slotTotal, slot) => {
        const assignmentCount = filterAssignments(slot.assignments, filters).filter(
          (assignment) => assignment.shortNotice,
        ).length;

        return slotTotal + (slot.shortNotice ? 1 : 0) + assignmentCount;
      }, 0)
    );
  }, 0);

  const summary = {
    dateCount: dateHealth.length,
    requiredTaskSlots: sum(dateHealth, (day) => day.requiredTaskSlots),
    filledAssignments: sum(dateHealth, (day) => day.filledAssignments),
    unfilledSlots: sum(dateHealth, (day) => day.unfilledSlots),
    ptoCount: ptoRequests.length,
    shortageConflictCount: sum(dateHealth, (day) => day.shortageConflictCount),
    shortNoticeCount:
      shortNoticeScheduleChangeCount +
      ptoRequests.filter((request) => request.shortNotice).length,
  };

  return {
    summary,
    dateHealth,
    employeeWorkloads,
    taskTypeStats,
    roleLeaders,
  };
}

function isRequiredSlot(slot: Pick<AnalyticsTaskSlot, "requirementLevel">) {
  return !slot.requirementLevel || slot.requirementLevel === "REQUIRED";
}

function filterSlots(slots: AnalyticsTaskSlot[], filters: StaffingAnalyticsFilters) {
  return slots.filter((slot) => !filters.taskTypeId || slot.taskTypeId === filters.taskTypeId);
}

function filterAssignments(
  assignments: AnalyticsAssignment[],
  filters: StaffingAnalyticsFilters,
) {
  return assignments.filter(
    (assignment) => !filters.employeeId || assignment.employeeId === filters.employeeId,
  );
}

function incrementTaskCount(
  stat: EmployeeWorkloadStat,
  taskTypeId: string,
  taskTypeName: string,
) {
  const existing = stat.taskCounts.find((task) => task.taskTypeId === taskTypeId);

  if (existing) {
    existing.count += 1;
    return;
  }

  stat.taskCounts.push({ taskTypeId, taskTypeName, count: 1 });
}

function isDateWithinRange(
  date: string,
  request: Pick<AnalyticsPtoRequest, "startDate" | "endDate">,
) {
  return request.startDate <= date && request.endDate >= date;
}

function sum<T>(items: T[], selector: (item: T) => number) {
  return items.reduce((total, item) => total + selector(item), 0);
}
