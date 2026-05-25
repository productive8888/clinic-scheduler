import type { ClinicScenario, TaskSlotRequirementLevel } from "@prisma/client";

export type StaffingRequirementTaskType = {
  id: string;
  name?: string;
  optional: boolean;
  active?: boolean;
  defaultForRoutine: boolean;
  defaultForReduced: boolean;
  sortOrder?: number;
};

export type StaffingRequirementRuleConfig = {
  id: string;
  taskTypeId: string;
  weekday: number | null;
  scenario: ClinicScenario | null;
  minRequiredSlots: number;
  desiredSlots: number;
  maxSlots: number;
  requirementLevel: TaskSlotRequirementLevel;
  active: boolean;
  effectiveStartDate?: Date | string | null;
  effectiveEndDate?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

export type StaffingSlotSource = "DEFAULT" | "STAFFING_RULE";

export type StaffingSlotSpec = {
  taskTypeId: string;
  slotIndex: number;
  requirementLevel: TaskSlotRequirementLevel;
  source: StaffingSlotSource;
  staffingRequirementRuleId: string | null;
};

export function selectStaffingSlotSpecs(input: {
  date: string;
  scenario: ClinicScenario;
  taskTypes: StaffingRequirementTaskType[];
  rules: StaffingRequirementRuleConfig[];
}) {
  if (input.scenario === "CLINIC_CLOSED") {
    return [];
  }

  const weekday = isoDateToUtcWeekday(input.date);
  const sortedTaskTypes = [...input.taskTypes]
    .filter((taskType) => taskType.active !== false)
    .sort(
      (left, right) =>
        (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
        left.id.localeCompare(right.id),
    );
  const specs: StaffingSlotSpec[] = [];

  for (const taskType of sortedTaskTypes) {
    const matchingRule = selectRuleForTaskType({
      date: input.date,
      scenario: input.scenario,
      weekday,
      taskTypeId: taskType.id,
      rules: input.rules,
    });

    if (matchingRule) {
      specs.push(...buildRuleSpecs(matchingRule));
      continue;
    }

    if (isDefaultTaskForScenario(input.scenario, taskType)) {
      specs.push({
        taskTypeId: taskType.id,
        slotIndex: 1,
        requirementLevel: "REQUIRED",
        source: "DEFAULT",
        staffingRequirementRuleId: null,
      });
    }
  }

  return specs;
}

function selectRuleForTaskType(input: {
  date: string;
  scenario: ClinicScenario;
  weekday: number;
  taskTypeId: string;
  rules: StaffingRequirementRuleConfig[];
}) {
  return input.rules
    .filter((rule) => {
      if (!rule.active || rule.taskTypeId !== input.taskTypeId) {
        return false;
      }

      if (rule.weekday !== null && rule.weekday !== input.weekday) {
        return false;
      }

      if (rule.scenario !== null && rule.scenario !== input.scenario) {
        return false;
      }

      return isDateWithinRule(input.date, rule);
    })
    .sort((left, right) => compareRuleSpecificity(left, right))[0];
}

function buildRuleSpecs(rule: StaffingRequirementRuleConfig) {
  const minRequiredSlots = Math.max(0, rule.minRequiredSlots);
  const desiredSlots = Math.max(minRequiredSlots, rule.desiredSlots);
  const maxSlots = Math.max(desiredSlots, rule.maxSlots);
  const slotCount = Math.min(desiredSlots, maxSlots);
  const specs: StaffingSlotSpec[] = [];

  for (let index = 1; index <= slotCount; index += 1) {
    specs.push({
      taskTypeId: rule.taskTypeId,
      slotIndex: index,
      requirementLevel:
        index <= minRequiredSlots || rule.requirementLevel === "REQUIRED"
          ? "REQUIRED"
          : rule.requirementLevel,
      source: "STAFFING_RULE",
      staffingRequirementRuleId: rule.id,
    });
  }

  return specs;
}

function compareRuleSpecificity(
  left: StaffingRequirementRuleConfig,
  right: StaffingRequirementRuleConfig,
) {
  const scoreDifference = ruleSpecificityScore(right) - ruleSpecificityScore(left);

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  return (
    timestamp(right.updatedAt ?? right.createdAt) -
      timestamp(left.updatedAt ?? left.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function ruleSpecificityScore(rule: StaffingRequirementRuleConfig) {
  return (
    (rule.scenario ? 4 : 0) +
    (rule.weekday !== null ? 4 : 0) +
    (rule.effectiveStartDate ? 1 : 0) +
    (rule.effectiveEndDate ? 1 : 0)
  );
}

function isDefaultTaskForScenario(
  scenario: ClinicScenario,
  taskType: StaffingRequirementTaskType,
) {
  if (taskType.optional) {
    return false;
  }

  if (scenario === "ROUTINE") {
    return taskType.defaultForRoutine;
  }

  if (scenario === "DOCTOR_OFF_REDUCED_STAFFING") {
    return taskType.defaultForReduced;
  }

  return false;
}

function isDateWithinRule(date: string, rule: StaffingRequirementRuleConfig) {
  const startDate = toIsoDate(rule.effectiveStartDate);
  const endDate = toIsoDate(rule.effectiveEndDate);

  if (startDate && date < startDate) {
    return false;
  }

  if (endDate && date > endDate) {
    return false;
  }

  return true;
}

function isoDateToUtcWeekday(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function toIsoDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function timestamp(value: Date | string | null | undefined) {
  if (!value) {
    return 0;
  }

  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
