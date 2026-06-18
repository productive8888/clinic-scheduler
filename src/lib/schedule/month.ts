export type MonthDayDisplayStatus =
  | "NOT_SCHEDULED"
  | "NOT_GENERATED"
  | "GENERATED_DRAFT"
  | "PUBLISHED"
  | "NEEDS_REVIEW"
  | "HARD_REQUIREMENTS_UNMET";

export type MonthDayTone =
  | "gray"
  | "blue"
  | "emerald"
  | "green"
  | "amber"
  | "red";

export function getMonthDayPresentation(input: {
  inMonth: boolean;
  isSunday: boolean;
  scheduleStatus?: string | null;
  hasGeneratedContent: boolean;
  publishIssueCount: number;
  hardRequirementCount: number;
  requiredShortageCount: number;
}) {
  if (!input.inMonth) {
    return {
      displayStatus: "NOT_GENERATED" as const,
      label: "Outside month",
      tone: "gray" as const,
      needsReview: false,
    };
  }

  if (
    input.isSunday &&
    !input.hasGeneratedContent &&
    !input.scheduleStatus
  ) {
    return {
      displayStatus: "NOT_SCHEDULED" as const,
      label: "Not scheduled",
      tone: "gray" as const,
      needsReview: false,
    };
  }

  if (
    !input.hasGeneratedContent &&
    (!input.scheduleStatus || input.scheduleStatus === "DRAFT")
  ) {
    return {
      displayStatus: "NOT_GENERATED" as const,
      label: "Not generated",
      tone: "gray" as const,
      needsReview: false,
    };
  }

  if (
    input.hardRequirementCount > 0 ||
    input.requiredShortageCount > 0
  ) {
    return {
      displayStatus: "HARD_REQUIREMENTS_UNMET" as const,
      label: "Hard requirements unmet",
      tone: "red" as const,
      needsReview: true,
    };
  }

  if (
    input.scheduleStatus === "NEEDS_REGENERATION" ||
    input.publishIssueCount > 0
  ) {
    return {
      displayStatus: "NEEDS_REVIEW" as const,
      label: "Needs review",
      tone: "amber" as const,
      needsReview: true,
    };
  }

  if (input.scheduleStatus === "PUBLISHED") {
    return {
      displayStatus: "PUBLISHED" as const,
      label: "Published",
      tone: "green" as const,
      needsReview: false,
    };
  }

  if (
    input.scheduleStatus === "GENERATED" ||
    input.scheduleStatus === "LOCKED" ||
    input.hasGeneratedContent
  ) {
    return {
      displayStatus: "GENERATED_DRAFT" as const,
      label: "Generated draft",
      tone:
        input.scheduleStatus === "LOCKED"
          ? ("blue" as const)
          : ("emerald" as const),
      needsReview: false,
    };
  }

  return {
    displayStatus: "NOT_GENERATED" as const,
    label: "Not generated",
    tone: "gray" as const,
    needsReview: false,
  };
}

export type MonthGenerationWeekSummary = {
  startDate: string;
  endDate: string;
  daysProcessed: number;
  daysCreated: number;
  daysRegenerated: number;
  daysSkippedPublished: number;
  employeesUnderTarget: Array<{
    employeeId: string;
    employeeName: string;
    scheduledHours: number;
    targetHours: number;
    blockers: string[];
  }>;
  hardRequirementIssues: number;
  bgMinimumIssues: number;
  workPatternIssues: number;
  saturdayIssues: number;
};

export type MonthActionOperation =
  | "GENERATE"
  | "REGENERATE"
  | "PUBLISH"
  | "UNPUBLISH"
  | "CLEAR";

export type MonthActionState = {
  outcome: "idle" | "success" | "blocked" | "error";
  operation: MonthActionOperation | null;
  message: string | null;
  metrics: Array<{ label: string; value: string | number }>;
  issues: string[];
  weekSummaries: MonthGenerationWeekSummary[];
};

export const EMPTY_MONTH_ACTION_STATE: MonthActionState = {
  outcome: "idle",
  operation: null,
  message: null,
  metrics: [],
  issues: [],
  weekSummaries: [],
};
