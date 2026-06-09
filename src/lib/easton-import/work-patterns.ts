export type EastonShiftCategory = "AM" | "PM" | "SATURDAY" | "ENDO" | "FLOAT" | "OTHER";
export type EastonWorkPatternKind =
  | "CUSTOM"
  | "ENDOSCOPY_SATURDAY"
  | "NON_ENDOSCOPY_SATURDAY";

export type EastonWorkPatternGroup = {
  code: string;
  label: string;
  name: string;
  kind: EastonWorkPatternKind;
  saturdayPaidHours: number;
  requiredSaturdayShiftCategory: EastonShiftCategory;
  extraHourWeekdays: number[];
  notes: string;
};

const EASTON_WORK_PATTERN_GROUPS: EastonWorkPatternGroup[] = [
  {
    code: "EASTON_GROUP_SATURDAY",
    label: "Saturday",
    name: "Saturday endoscopy group",
    kind: "ENDOSCOPY_SATURDAY",
    saturdayPaidHours: 8,
    requiredSaturdayShiftCategory: "ENDO",
    extraHourWeekdays: [],
    notes:
      "July model: works Saturday 0600-1400 for 8 paid hours and does not need weekday make-up hours.",
  },
  {
    code: "EASTON_GROUP_M_TH",
    label: "M + Th",
    name: "Monday + Thursday extra-hour group",
    kind: "NON_ENDOSCOPY_SATURDAY",
    saturdayPaidHours: 6,
    requiredSaturdayShiftCategory: "SATURDAY",
    extraHourWeekdays: [1, 4],
    notes:
      "July model: works Saturday 0800-1400 for 6 paid hours plus 5-hour shifts Monday and Thursday.",
  },
  {
    code: "EASTON_GROUP_T_TH",
    label: "T + Th",
    name: "Tuesday + Thursday extra-hour group",
    kind: "NON_ENDOSCOPY_SATURDAY",
    saturdayPaidHours: 6,
    requiredSaturdayShiftCategory: "SATURDAY",
    extraHourWeekdays: [2, 4],
    notes:
      "July model: works Saturday 0800-1400 for 6 paid hours plus 5-hour shifts Tuesday and Thursday.",
  },
  {
    code: "EASTON_GROUP_M_W",
    label: "M + W",
    name: "Monday + Wednesday extra-hour group",
    kind: "NON_ENDOSCOPY_SATURDAY",
    saturdayPaidHours: 6,
    requiredSaturdayShiftCategory: "SATURDAY",
    extraHourWeekdays: [1, 3],
    notes:
      "July model: works Saturday 0800-1400 for 6 paid hours plus 5-hour shifts Monday and Wednesday.",
  },
  {
    code: "EASTON_GROUP_M_T",
    label: "M + T",
    name: "Monday + Tuesday extra-hour group",
    kind: "NON_ENDOSCOPY_SATURDAY",
    saturdayPaidHours: 6,
    requiredSaturdayShiftCategory: "SATURDAY",
    extraHourWeekdays: [1, 2],
    notes:
      "July model: works Saturday 0800-1400 for 6 paid hours plus 5-hour shifts Monday and Tuesday.",
  },
  {
    code: "EASTON_GROUP_T_W",
    label: "T + W",
    name: "Tuesday + Wednesday extra-hour group",
    kind: "NON_ENDOSCOPY_SATURDAY",
    saturdayPaidHours: 6,
    requiredSaturdayShiftCategory: "SATURDAY",
    extraHourWeekdays: [2, 3],
    notes:
      "July model: works Saturday 0800-1400 for 6 paid hours plus 5-hour shifts Tuesday and Wednesday.",
  },
  {
    code: "EASTON_GROUP_W_TH",
    label: "W + Th",
    name: "Wednesday + Thursday extra-hour group",
    kind: "NON_ENDOSCOPY_SATURDAY",
    saturdayPaidHours: 6,
    requiredSaturdayShiftCategory: "SATURDAY",
    extraHourWeekdays: [3, 4],
    notes:
      "July model: works Saturday 0800-1400 for 6 paid hours plus 5-hour shifts Wednesday and Thursday.",
  },
];

export function eastonWorkPatternGroups() {
  return EASTON_WORK_PATTERN_GROUPS;
}

export function resolveEastonWorkPatternGroup(label?: string | null) {
  if (!label) {
    return null;
  }

  const normalized = normalizeEastonWorkPatternLabel(label);

  return (
    EASTON_WORK_PATTERN_GROUPS.find(
      (group) => normalizeEastonWorkPatternLabel(group.label) === normalized,
    ) ?? null
  );
}

export function normalizeEastonWorkPatternLabel(value: string) {
  return value.trim().replace(/\s+/g, " ").replace(/\bTH\b/i, "Th").toUpperCase();
}

export function weekdayShortName(weekday: number) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekday] ?? String(weekday);
}
