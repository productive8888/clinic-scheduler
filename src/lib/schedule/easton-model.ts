export const ACTIVE_EASTON_MODEL_START_DATE = "2026-07-01";
export const ACTIVE_EASTON_TARGET_PATTERN_CODE =
  "EASTON_JULY_ACTIVE_TARGETS";

export function isActiveEastonModelDate(date: string) {
  return date >= ACTIVE_EASTON_MODEL_START_DATE;
}

export function eastonTargetPatternCodeForDate(date: string) {
  return isActiveEastonModelDate(date)
    ? ACTIVE_EASTON_TARGET_PATTERN_CODE
    : null;
}
