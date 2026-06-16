export const CANONICAL_BG_TASK_CODE = "BACKGROUND";

export function isCanonicalBgTaskCode(code?: string | null) {
  return code?.toUpperCase() === CANONICAL_BG_TASK_CODE;
}

export function isCanonicalBgTaskType(taskType?: { code?: string | null } | null) {
  return isCanonicalBgTaskCode(taskType?.code);
}
