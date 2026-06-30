import type { MonthGenerationWeekSummary } from "@/lib/schedule/month";

export type WeekActionOperation =
  | "GENERATE"
  | "PARTIAL_GENERATE"
  | "FULL_REGENERATE";

export type WeekActionState = {
  outcome: "idle" | "success" | "blocked" | "error";
  operation: WeekActionOperation | null;
  message: string | null;
  metrics: Array<{ label: string; value: string | number }>;
  issues: string[];
  weekSummaries: MonthGenerationWeekSummary[];
};

export const EMPTY_WEEK_ACTION_STATE: WeekActionState = {
  outcome: "idle",
  operation: null,
  message: null,
  metrics: [],
  issues: [],
  weekSummaries: [],
};
