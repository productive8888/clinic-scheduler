export type JulyPatientShiftGroup = "GI" | "ALLERGY" | "PCP";

const JULY_PATIENT_SHIFT_GROUP_BY_CODE: Record<string, JulyPatientShiftGroup> = {
  ALLERGY: "ALLERGY",
  GI: "GI",
  NEW_ALLERGY: "ALLERGY",
  NEW_GI: "GI",
  PCP: "PCP",
  VIRTUAL_ALLERGY: "ALLERGY",
  VIRTUAL_GI: "GI",
};

export function normalizeTaskCode(code: string) {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function julyPatientShiftGroupFromTaskCode(
  taskTypeCode?: string | null,
) {
  if (!taskTypeCode) {
    return null;
  }

  return JULY_PATIENT_SHIFT_GROUP_BY_CODE[normalizeTaskCode(taskTypeCode)] ?? null;
}

export function isJulyPatientShiftTaskCode(taskTypeCode?: string | null) {
  return Boolean(julyPatientShiftGroupFromTaskCode(taskTypeCode));
}

export function isJulyPatientShiftTaskType(taskType?: { code?: string | null } | null) {
  return isJulyPatientShiftTaskCode(taskType?.code);
}

export function julyPatientShiftCountFromExposure(input: {
  GI: number;
  ALLERGY: number;
  PCP: number;
}) {
  return input.GI + input.ALLERGY + input.PCP;
}
