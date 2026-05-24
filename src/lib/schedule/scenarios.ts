import type { ClinicScenario } from "@prisma/client";

export type ScenarioTaskConfig = {
  id: string;
  optional: boolean;
  defaultForRoutine: boolean;
  defaultForReduced: boolean;
};

export function scenarioCreatesDefaultSlots(scenario: ClinicScenario) {
  return scenario === "ROUTINE" || scenario === "DOCTOR_OFF_REDUCED_STAFFING";
}

export function isDefaultTaskForScenario(
  scenario: ClinicScenario,
  taskType: ScenarioTaskConfig,
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

export function selectDefaultTaskTypesForScenario<T extends ScenarioTaskConfig>(
  scenario: ClinicScenario,
  taskTypes: T[],
) {
  return taskTypes.filter((taskType) =>
    isDefaultTaskForScenario(scenario, taskType),
  );
}
