import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { resolveEastonWorkPatternGroup } from "@/lib/easton-import/work-patterns";

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
  roleLabel: string | null;
  groupLabel: string | null;
  workPatternCode: string | null;
  requiredBackgroundAssignments: number;
  extraHourWeekdays: number[];
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
  shifts: EastonParsedShift[];
  roleDemand: EastonRoleDemand[];
  employeeTargets: EastonEmployeeTarget[];
  sampleAssignments: EastonSampleAssignment[];
  warnings: string[];
};

const PRIVATE_WORKBOOK_CANDIDATES = [
  path.join(process.cwd(), "private", "New Easton Scheduling.xlsx"),
  path.join(process.cwd(), "private", "new easton scheduling.xlsx"),
  path.join(process.cwd(), "private", "easton-scheduling.xlsx"),
  path.join(process.cwd(), "private", "Copy of Easton Scheduling.xlsx"),
];

const ROLE_CODE_ALIASES: Record<string, string> = {
  ALLERGY: "NEW_ALLERGY",
  "NEW ALLERGY": "NEW_ALLERGY",
  "VIRTUAL ALLERGY": "VIRTUAL_ALLERGY",
  GI: "NEW_GI",
  "NEW GI": "NEW_GI",
  "VIRTUAL GI": "VIRTUAL_GI",
  PCP: "FOLLOWUP",
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

const EXPOSURE_BY_ROLE_CODE: Record<string, string> = {
  NEW_GI: "GI",
  VIRTUAL_GI: "GI",
  NEW_ALLERGY: "ALLERGY",
  VIRTUAL_ALLERGY: "ALLERGY",
  FOLLOWUP: "PCP",
};

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
  const shiftsByGy = workbook.getWorksheet("Shifts by GY");

  if (!shiftsAndHours) {
    warnings.push("Missing Shifts + Hours sheet.");
  }

  if (!shiftsByGy) {
    warnings.push("Missing Shifts by GY sheet.");
  }

  const primaryDemand = shiftsAndHours
    ? parseShiftDemandSheet(shiftsAndHours)
    : { shifts: [], roleDemand: [], warnings: [] };

  warnings.push(...primaryDemand.warnings);

  return {
    workbookPath,
    workbookModifiedAt: stats.mtime.toISOString(),
    sheets,
    shifts: dedupeShifts(primaryDemand.shifts),
    roleDemand: primaryDemand.roleDemand,
    employeeTargets: shiftsByGy ? parseEmployeeTargetsSheet(shiftsByGy) : [],
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
    let targetTotalHours: number | null = null;
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
        targetPatientShifts = value;
      } else if (header.trim().toLowerCase() === "bg") {
        targetTaskCounts.BACKGROUND = value;
        requiredBackgroundAssignments = value;
      } else if (headerCode !== "SHIFT_HOURS") {
        targetTaskCounts[headerCode] = value;
      }

      if (value > 0 && column >= 18 && column <= 22 && targetTotalHours === null) {
        targetTotalHours = value;
      }
    }

    const exposureGoals = ["GI", "ALLERGY", "PCP"].filter((goal) =>
      hasExposureTarget(goal, targetTaskCounts),
    );
    const groupLabel = nullableText(row.getCell(5));
    const workPatternGroup = resolveEastonWorkPatternGroup(groupLabel);

    targets.push({
      employeeName,
      roleLabel: nullableText(row.getCell(4)),
      groupLabel,
      workPatternCode: workPatternGroup?.code ?? null,
      requiredBackgroundAssignments,
      extraHourWeekdays: workPatternGroup?.extraHourWeekdays ?? [],
      targetTaskCounts,
      targetPatientShifts,
      targetTotalHours: 40,
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
    shifts: [],
    roleDemand: [],
    employeeTargets: [],
    sampleAssignments: [],
    warnings: input.warnings,
  } satisfies EastonWorkbookPreview;
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
    ([roleCode, count]) => count > 0 && EXPOSURE_BY_ROLE_CODE[roleCode] === goal,
  );
}

function validatePatientTotals(
  sheetName: string,
  shifts: EastonParsedShift[],
  roleDemand: EastonRoleDemand[],
) {
  const warnings: string[] = [];
  const patientFacingCodes = new Set(["NEW_GI", "NEW_ALLERGY", "FOLLOWUP"]);

  for (const shift of shifts) {
    const shiftDemand = roleDemand.filter(
      (demand) =>
        demand.weekday === shift.weekday &&
        demand.startMinute === shift.startMinute &&
        demand.endMinute === shift.endMinute &&
        demand.paidHours === shift.paidHours,
    );
    const expected = shiftDemand
      .filter((demand) => patientFacingCodes.has(demand.roleCode))
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
