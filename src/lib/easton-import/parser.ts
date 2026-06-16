import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { resolveEastonWorkPatternGroup } from "@/lib/easton-import/work-patterns";
import { julyPatientShiftGroupFromTaskCode } from "@/lib/schedule/patient-shifts";

export type EastonParsedShift = {
  sheetName: string;
  column: number;
  dayLabel: string;
  weekday: number;
  label: string;
  startMinute: number;
  endMinute: number;
  paidHours: number;
  shiftCategory: "AM" | "PM" | "SATURDAY" | "ENDO" | "FLOAT" | "OTHER";
};

export type EastonRoleDemand = {
  sheetName: string;
  roleName: string;
  roleCode: string;
  weekday: number;
  shiftLabel: string;
  startMinute: number;
  endMinute: number;
  paidHours: number;
  count: number;
  aggregate: boolean;
};

export type EastonEmployeeTarget = {
  employeeName: string;
  skillLabel: string | null;
  roleLabel: string | null;
  groupLabel: string | null;
  workPatternCode: string | null;
  activeTargetSheetName: string;
  scheduleEligibility: "ACTIVE_SCHEDULED" | "SPECIAL_EXCLUDED" | "NEEDS_REVIEW";
  scheduleEligibilityReason: string | null;
  requiredBackgroundAssignments: number;
  extraHourWeekdays: number[];
  importedSkillCodes: string[];
  targetTaskCounts: Record<string, number>;
  targetPatientShifts: number | null;
  targetTotalHours: number | null;
  exposureGoals: string[];
};

export type EastonSampleAssignment = {
  employeeName: string;
  weekday: number;
  dayLabel: string;
  shiftLabel: string;
  roleName: string;
  roleCode: string;
};

export type EastonWorkbookPreview = {
  workbookPath: string | null;
  workbookModifiedAt: string | null;
  sheets: { name: string; rowCount: number; columnCount: number }[];
  activeEmployeeTargetSheetName: string | null;
  shifts: EastonParsedShift[];
  roleDemand: EastonRoleDemand[];
  employeeTargets: EastonEmployeeTarget[];
  sampleAssignments: EastonSampleAssignment[];
  warnings: string[];
};

const PRIVATE_WORKBOOK_CANDIDATES = [
  path.join(process.cwd(), "private", "Easton Scheduling 6-16.xlsx"),
  path.join(process.cwd(), "private", "easton scheduling 6-16.xlsx"),
  path.join(process.cwd(), "private", "New Easton Scheduling.xlsx"),
  path.join(process.cwd(), "private", "new easton scheduling.xlsx"),
  path.join(process.cwd(), "private", "easton-scheduling.xlsx"),
  path.join(process.cwd(), "private", "Copy of Easton Scheduling.xlsx"),
];

const ACTIVE_TARGET_SHEET_NAMES = [
  "NEW NEW Shifts by GY",
  "NEW Shifts by GY",
  "Shifts by GY",
] as const;

const ROLE_CODE_ALIASES: Record<string, string> = {
  ALLERGY: "NEW_ALLERGY",
  "NEW ALLERGY": "NEW_ALLERGY",
  "VIRTUAL ALLERGY": "VIRTUAL_ALLERGY",
  GI: "NEW_GI",
  "NEW GI": "NEW_GI",
  "VIRTUAL GI": "VIRTUAL_GI",
  PCP: "PCP",
  "FOLLOW UP": "FOLLOWUP",
  FOLLOWUP: "FOLLOWUP",
  FRONT: "FRONT_DESK",
  "FRONT DESK": "FRONT_DESK",
  "FRONT BG": "FRONT_BACKGROUND",
  "FRONT BACKGROUND": "FRONT_BACKGROUND",
  PROC: "PROCEDURE",
  PROCEDURES: "PROCEDURE",
  PROCEDURE: "PROCEDURE",
  CIVIL: "CIVIL_SURGEON",
  ENDO: "ENDOSCOPY",
  ENDOSCOPY: "ENDOSCOPY",
  BG: "BACKGROUND",
  BACKGROUND: "BACKGROUND",
  RESEARCH: "RESEARCH",
  BOOKING: "BOOKING",
  FLOAT: "FLOAT",
  IT: "IT",
  PATIENTS: "PATIENTS",
};

const SKILL_CODE_ALIASES: Record<string, string> = {
  FRONT: "FRONT",
};

const DEPRECATED_JULY_ROLE_CODES = new Set(["ALLERGY_SHOTS"]);

export function resolveEastonWorkbookPath(explicitPath?: string | null) {
  const configuredCandidates =
    process.env.NODE_ENV === "production"
      ? []
      : [explicitPath, process.env.EASTON_SCHEDULING_WORKBOOK]
          .filter((candidate): candidate is string => Boolean(candidate))
          .map((candidate) => path.resolve(/* turbopackIgnore: true */ candidate));

  const candidates = [...configuredCandidates, ...PRIVATE_WORKBOOK_CANDIDATES];

  for (const candidate of candidates) {
    if (fs.existsSync(/* turbopackIgnore: true */ candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function parseEastonWorkbook(explicitPath?: string | null) {
  const workbookPath = resolveEastonWorkbookPath(explicitPath);
  const warnings: string[] = [];

  if (!workbookPath) {
    return emptyPreview({
      workbookPath: null,
      workbookModifiedAt: null,
      warnings: [
        "No private Easton workbook found. Place it at private/easton-scheduling.xlsx or set EASTON_SCHEDULING_WORKBOOK.",
      ],
    });
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(/* turbopackIgnore: true */ workbookPath);

  const stats = fs.statSync(/* turbopackIgnore: true */ workbookPath);
  const sheets = workbook.worksheets.map((worksheet) => ({
    name: worksheet.name,
    rowCount: worksheet.rowCount,
    columnCount: worksheet.columnCount,
  }));

  const shiftsAndHours = workbook.getWorksheet("Shifts + Hours");
  const activeTargetSheet = selectActiveEmployeeTargetSheet(workbook);

  if (!shiftsAndHours) {
    warnings.push("Missing Shifts + Hours sheet.");
  }

  if (!activeTargetSheet) {
    warnings.push(
      "Missing active employee target sheet. Expected NEW NEW Shifts by GY, NEW Shifts by GY, or Shifts by GY.",
    );
  } else {
    warnings.push(`Active employee target sheet: ${activeTargetSheet.name}.`);
  }

  const primaryDemand = shiftsAndHours
    ? parseShiftDemandSheet(shiftsAndHours)
    : { shifts: [], roleDemand: [], warnings: [] };

  warnings.push(...primaryDemand.warnings);
  warnings.push(
    "Allergy Shots is deprecated for July generation; historical records remain, but July staffing demand ignores Allergy Shots.",
  );

  return {
    workbookPath,
    workbookModifiedAt: stats.mtime.toISOString(),
    sheets,
    activeEmployeeTargetSheetName: activeTargetSheet?.name ?? null,
    shifts: dedupeShifts(primaryDemand.shifts),
    roleDemand: primaryDemand.roleDemand,
    employeeTargets: activeTargetSheet
      ? parseEmployeeTargetsSheet(activeTargetSheet)
      : [],
    sampleAssignments: [],
    warnings,
  } satisfies EastonWorkbookPreview;
}

export function normalizeEastonRoleCode(roleName: string) {
  const normalized = roleName
    .trim()
    .replace(/\s+/g, " ")
    .replaceAll("-", " ")
    .toUpperCase();

  return ROLE_CODE_ALIASES[normalized] ?? normalized.replace(/\s+/g, "_");
}

export function parseEastonSkillCodes(skillLabel?: string | null) {
  if (!skillLabel) {
    return [];
  }

  const normalized = skillLabel
    .toUpperCase()
    .replace(/[_/,&]+/g, " ")
    .replace(/\+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = normalized.split(" ").filter(Boolean);
  const skillCodes = new Set<string>();

  for (const token of tokens) {
    const skillCode = SKILL_CODE_ALIASES[token];

    if (skillCode) {
      skillCodes.add(skillCode);
    }
  }

  return [...skillCodes].sort();
}

export function isDeprecatedEastonJulyRoleCode(roleCode: string) {
  return DEPRECATED_JULY_ROLE_CODES.has(normalizeEastonRoleCode(roleCode));
}

function parseShiftDemandSheet(worksheet: ExcelJS.Worksheet) {
  const shifts: EastonParsedShift[] = [];
  const roleDemand: EastonRoleDemand[] = [];
  const warnings: string[] = [];
  const shiftColumns = parseShiftColumns(worksheet);

  shifts.push(...shiftColumns);

  for (let rowNumber = 4; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const roleName = cellText(row.getCell(1));

    if (!roleName) {
      continue;
    }

    const roleCode = normalizeEastonRoleCode(roleName);

    if (roleCode === "SHIFT_HOURS") {
      continue;
    }

    if (isDeprecatedEastonJulyRoleCode(roleCode)) {
      warnings.push(
        `${worksheet.name}: ${roleName} is deprecated for July generation and was ignored.`,
      );
      continue;
    }

    for (const shift of shiftColumns) {
      const value = numericCell(row.getCell(shift.column));

      if (!value || value <= 0) {
        continue;
      }

      roleDemand.push({
        sheetName: worksheet.name,
        roleName,
        roleCode,
        weekday: shift.weekday,
        shiftLabel: shift.label,
        startMinute: shift.startMinute,
        endMinute: shift.endMinute,
        paidHours: shift.paidHours,
        count: value,
        aggregate: roleCode === "PATIENTS",
      });
    }
  }

  warnings.push(...validatePatientTotals(worksheet.name, shiftColumns, roleDemand));

  return { shifts, roleDemand, warnings };
}

function parseShiftColumns(worksheet: ExcelJS.Worksheet) {
  const columns: EastonParsedShift[] = [];
  let currentDayLabel = "";
  let currentWeekday: number | null = null;

  for (let column = 1; column <= worksheet.columnCount; column += 1) {
    const dayText = cellText(worksheet.getRow(1).getCell(column));
    const shiftText = cellText(worksheet.getRow(2).getCell(column));

    if (dayText) {
      const parsedDay = parseWeekday(dayText);

      if (parsedDay !== null) {
        currentDayLabel = dayText;
        currentWeekday = parsedDay;
      }
    }

    if (!shiftText || currentWeekday === null) {
      continue;
    }

    const parsedShift = parseShiftLabel(shiftText);

    if (!parsedShift) {
      continue;
    }

    const rowHours = numericCell(worksheet.getRow(3).getCell(column));
    const paidHours = rowHours && rowHours > 0 ? rowHours : parsedShift.paidHours;

    columns.push({
      sheetName: worksheet.name,
      column,
      dayLabel: currentDayLabel,
      weekday: currentWeekday,
      label: shiftText,
      startMinute: parsedShift.startMinute,
      endMinute: parsedShift.endMinute,
      paidHours,
      shiftCategory: inferShiftCategory({
        weekday: currentWeekday,
        startMinute: parsedShift.startMinute,
        endMinute: parsedShift.endMinute,
      }),
    });
  }

  return columns;
}

function selectActiveEmployeeTargetSheet(workbook: ExcelJS.Workbook) {
  for (const sheetName of ACTIVE_TARGET_SHEET_NAMES) {
    const worksheet = workbook.getWorksheet(sheetName);

    if (worksheet) {
      return worksheet;
    }
  }

  return null;
}

function parseEmployeeTargetsSheet(worksheet: ExcelJS.Worksheet) {
  const headers = new Map<number, string>();

  for (let column = 1; column <= worksheet.columnCount; column += 1) {
    const header = cellText(worksheet.getRow(1).getCell(column));

    if (header) {
      headers.set(column, header);
    }
  }

  const targets: EastonEmployeeTarget[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const employeeName = cellText(row.getCell(3));

    if (!employeeName) {
      continue;
    }

    const targetTaskCounts: Record<string, number> = {};
    let targetPatientShifts: number | null = null;
    let requiredBackgroundAssignments = 0;

    for (const [column, header] of headers) {
      if (column < 5) {
        continue;
      }

      const value = numericCell(row.getCell(column));

      if (value === null) {
        continue;
      }

      const headerCode = normalizeEastonRoleCode(header.replace(/\(.+\)/, ""));

      if (headerCode === "PATIENTS") {
        targetPatientShifts = value > 0 ? value : null;
      } else if (header.trim().toLowerCase() === "bg") {
        if (value > 0) {
          targetTaskCounts.BACKGROUND = value;
          requiredBackgroundAssignments = value;
        }
      } else if (headerCode !== "SHIFT_HOURS" && value > 0) {
        targetTaskCounts[headerCode] = value;
      }

    }

    const exposureGoals = ["GI", "ALLERGY", "PCP"].filter((goal) =>
      hasExposureTarget(goal, targetTaskCounts),
    );
    const groupLabel = nullableText(row.getCell(5));
    const workPatternGroup = resolveEastonWorkPatternGroup(groupLabel);
    const eligibility = classifyEmployeeTarget({
      roleLabel: nullableText(row.getCell(4)),
      groupLabel,
      hasRecognizedWorkPattern: Boolean(workPatternGroup),
      targetTaskCounts,
      targetPatientShifts,
      requiredBackgroundAssignments,
    });

    targets.push({
      employeeName,
      skillLabel: nullableText(row.getCell(2)),
      roleLabel: nullableText(row.getCell(4)),
      groupLabel,
      workPatternCode: workPatternGroup?.code ?? null,
      activeTargetSheetName: worksheet.name,
      scheduleEligibility: eligibility.status,
      scheduleEligibilityReason: eligibility.reason,
      requiredBackgroundAssignments,
      extraHourWeekdays: workPatternGroup?.extraHourWeekdays ?? [],
      importedSkillCodes: parseEastonSkillCodes(nullableText(row.getCell(2))),
      targetTaskCounts,
      targetPatientShifts,
      targetTotalHours:
        eligibility.status === "ACTIVE_SCHEDULED" ? 40 : null,
      exposureGoals,
    });
  }

  return targets;
}

function emptyPreview(input: {
  workbookPath: string | null;
  workbookModifiedAt: string | null;
  warnings: string[];
}) {
  return {
    workbookPath: input.workbookPath,
    workbookModifiedAt: input.workbookModifiedAt,
    sheets: [],
    activeEmployeeTargetSheetName: null,
    shifts: [],
    roleDemand: [],
    employeeTargets: [],
    sampleAssignments: [],
    warnings: input.warnings,
  } satisfies EastonWorkbookPreview;
}

function classifyEmployeeTarget(input: {
  roleLabel: string | null;
  groupLabel: string | null;
  hasRecognizedWorkPattern: boolean;
  targetTaskCounts: Record<string, number>;
  targetPatientShifts: number | null;
  requiredBackgroundAssignments: number;
}): {
  status: EastonEmployeeTarget["scheduleEligibility"];
  reason: string | null;
} {
  const hasRoleTargets =
    input.requiredBackgroundAssignments > 0 ||
    Number(input.targetPatientShifts ?? 0) > 0 ||
    Object.values(input.targetTaskCounts).some((value) => value > 0);

  if (input.hasRecognizedWorkPattern) {
    return { status: "ACTIVE_SCHEDULED", reason: null };
  }

  if (!hasRoleTargets) {
    return {
      status: "SPECIAL_EXCLUDED",
      reason:
        input.roleLabel || input.groupLabel
          ? "No recognized July group and no active role targets in the active sheet."
          : "No active July scheduling targets in the active sheet.",
    };
  }

  return {
    status: "NEEDS_REVIEW",
    reason: input.groupLabel
      ? `Unrecognized July work-pattern group: ${input.groupLabel}.`
      : "Active role targets exist but no July work-pattern group was provided.",
  };
}

function parseWeekday(value: string) {
  const normalized = value.toLowerCase();

  if (normalized.includes("monday")) return 1;
  if (normalized.includes("tuesday")) return 2;
  if (normalized.includes("wednesday")) return 3;
  if (normalized.includes("thursday")) return 4;
  if (normalized.includes("friday")) return 5;
  if (normalized.includes("saturday")) return 6;
  if (normalized.includes("sunday")) return 0;

  return null;
}

function parseShiftLabel(value: string) {
  const match = value.match(/(\d{1,2})(\d{2})\s*~\s*(\d{1,2})(\d{2})\s*\(([\d.]+)\)/);

  if (!match) {
    return null;
  }

  const [, startHour, startMinute, endHour, endMinute, paidHours] = match;

  return {
    startMinute: Number(startHour) * 60 + Number(startMinute),
    endMinute: Number(endHour) * 60 + Number(endMinute),
    paidHours: Number(paidHours),
  };
}

function inferShiftCategory(input: {
  weekday: number;
  startMinute: number;
  endMinute: number;
}): EastonParsedShift["shiftCategory"] {
  if (input.weekday === 6 && input.startMinute <= 6 * 60) {
    return "ENDO";
  }

  if (input.weekday === 6) {
    return "SATURDAY";
  }

  if (input.endMinute <= 12 * 60) {
    return "AM";
  }

  if (input.startMinute >= 12 * 60) {
    return "PM";
  }

  return "OTHER";
}

function hasExposureTarget(goal: string, counts: Record<string, number>) {
  return Object.entries(counts).some(
    ([roleCode, count]) =>
      count > 0 && julyPatientShiftGroupFromTaskCode(roleCode) === goal,
  );
}

function validatePatientTotals(
  sheetName: string,
  shifts: EastonParsedShift[],
  roleDemand: EastonRoleDemand[],
) {
  const warnings: string[] = [];
  for (const shift of shifts) {
    const shiftDemand = roleDemand.filter(
      (demand) =>
        demand.weekday === shift.weekday &&
        demand.startMinute === shift.startMinute &&
        demand.endMinute === shift.endMinute &&
        demand.paidHours === shift.paidHours,
    );
    const expected = shiftDemand
      .filter((demand) => julyPatientShiftGroupFromTaskCode(demand.roleCode))
      .reduce((total, demand) => total + demand.count, 0);
    const patients = shiftDemand.find((demand) => demand.roleCode === "PATIENTS");

    if (patients && patients.count !== expected) {
      warnings.push(
        `${sheetName}: Patients total ${patients.count} does not match GI + Allergy + PCP total ${expected} for ${shift.dayLabel} ${shift.label}.`,
      );
    }
  }

  return warnings;
}

function dedupeShifts(shifts: EastonParsedShift[]) {
  const seen = new Set<string>();
  const unique: EastonParsedShift[] = [];

  for (const shift of shifts) {
    const key = `${shift.weekday}:${shift.startMinute}:${shift.endMinute}:${shift.paidHours}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(shift);
  }

  return unique.sort(
    (left, right) =>
      left.weekday - right.weekday ||
      left.startMinute - right.startMinute ||
      left.endMinute - right.endMinute,
  );
}

function cellText(cell: ExcelJS.Cell) {
  const value = cell.value;

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }

    if ("result" in value && value.result !== undefined && value.result !== null) {
      return String(value.result).trim();
    }

    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
  }

  return String(value).trim();
}

function nullableText(cell: ExcelJS.Cell) {
  const text = cellText(cell);

  return text || null;
}

function numericCell(cell: ExcelJS.Cell) {
  const value = cell.value;

  if (typeof value === "number") {
    return value;
  }

  const text = cellText(cell);

  if (!text) {
    return null;
  }

  const numeric = Number(text);

  return Number.isFinite(numeric) ? numeric : null;
}
