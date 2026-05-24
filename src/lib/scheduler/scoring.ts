import {
  getDifficultTaskFatigueScore,
  getFairnessScore,
} from "./fairness";
import { dateToWeekday } from "./constraints";
import type {
  ExistingAssignment,
  SchedulerEmployee,
  SchedulerRule,
  SchedulerTaskSlot,
  SchedulerTaskType,
} from "./types";

export type ScoreCandidateInput = {
  seed: string;
  employee: SchedulerEmployee;
  taskType: SchedulerTaskType;
  slot: SchedulerTaskSlot;
  assignments: ExistingAssignment[];
  rules: SchedulerRule[];
};

export function scoreCandidate(input: ScoreCandidateInput) {
  const { employee, taskType, slot, assignments, rules, seed } = input;
  let score = 100;

  score += getFairnessScore(employee, assignments);
  score += getDifficultTaskFatigueScore(
    employee,
    taskType.id,
    taskType.difficultyWeight ?? 0,
  );

  if (employee.preferredTaskTypeIds?.includes(taskType.id)) {
    score += 18;
  }

  score += getRuleScore(employee, taskType, slot, rules);
  score += seededTieBreaker(seed, employee.id, slot.id);

  return score;
}

export function getRuleScore(
  employee: SchedulerEmployee,
  taskType: SchedulerTaskType,
  slot: SchedulerTaskSlot,
  rules: SchedulerRule[],
) {
  return rules.reduce((score, rule) => {
    if (!ruleApplies(rule, employee, taskType, slot)) {
      return score;
    }

    const weight = rule.weight || 0;

    switch (rule.type) {
      case "PREFER_EMPLOYEE_FOR_TASK":
      case "PREFER_EMPLOYEE_TASK":
      case "PRIORITY_BOOST":
      case "SKILL_WEIGHT":
        return score + Math.abs(weight);
      case "AVOID_EMPLOYEE_FOR_TASK":
      case "AVOID_EMPLOYEE_TASK":
      case "PRIORITY_PENALTY":
        return score - Math.abs(weight);
      case "BACKUP_ONLY":
        return score - (Math.abs(weight) || 250);
      case "PREFERRED_DAY":
        return score + Math.abs(weight);
      case "MIN_ASSIGNMENTS":
        return score + Math.abs(weight);
      case "MAX_ASSIGNMENTS":
        return score - Math.abs(weight);
      case "CUSTOM":
        return score + weight;
      default:
        return score;
    }
  }, 0);
}

export function seededTieBreaker(seed: string, employeeId: string, slotId: string) {
  return stableHash(`${seed}:${employeeId}:${slotId}`) / 1_000_000;
}

function ruleApplies(
  rule: SchedulerRule,
  employee: SchedulerEmployee,
  taskType: SchedulerTaskType,
  slot: SchedulerTaskSlot,
) {
  if (rule.active === false) {
    return false;
  }

  if (rule.employeeId && rule.employeeId !== employee.id) {
    return false;
  }

  if (rule.taskTypeId && rule.taskTypeId !== taskType.id) {
    return false;
  }

  if (rule.effectiveStartDate && slot.date < rule.effectiveStartDate) {
    return false;
  }

  if (rule.effectiveEndDate && slot.date > rule.effectiveEndDate) {
    return false;
  }

  if (rule.type === "PREFERRED_DAY") {
    const weekday = rule.parameters?.weekday;
    return typeof weekday !== "number" || weekday === dateToWeekday(slot.date);
  }

  return true;
}

function stableHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % 1_000_000;
}
