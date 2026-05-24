export type IsoDate = string;

export type SchedulerEmployee = {
  id: string;
  fullName: string;
  active?: boolean;
  skillIds: string[];
  preferredTaskTypeIds?: string[];
  availability: AvailabilityWindow[];
  unavailable?: UnavailableWindow[];
  weeklyAssignmentLimit?: number | null;
  historicalAssignments?: number;
  historicalTaskAssignments?: Record<string, number>;
};

export type SchedulerTaskType = {
  id: string;
  code: string;
  name: string;
  requiredSkillIds: string[];
  interchangeableGroup?: string | null;
  difficultyWeight?: number;
  sortOrder?: number;
};

export type SchedulerTaskSlot = {
  id: string;
  date: IsoDate;
  taskTypeId: string;
  slotIndex: number;
  startMinute?: number | null;
  endMinute?: number | null;
  minStaff?: number;
  requiredStaff?: number;
  lockedEmployeeId?: string | null;
  lockedEmployeeIds?: string[];
};

export type AvailabilityWindow = {
  weekday: number;
  startMinute: number;
  endMinute: number;
  effectiveStartDate?: IsoDate | null;
  effectiveEndDate?: IsoDate | null;
  active?: boolean;
};

export type UnavailableWindow = {
  startDate: IsoDate;
  endDate: IsoDate;
  startMinute?: number | null;
  endMinute?: number | null;
  active?: boolean;
};

export type ExistingAssignment = {
  slotId: string;
  employeeId: string;
  date: IsoDate;
  taskTypeId: string;
  startMinute?: number | null;
  endMinute?: number | null;
  locked?: boolean;
};

export type SchedulerRuleType =
  | "PREFER_EMPLOYEE_FOR_TASK"
  | "AVOID_EMPLOYEE_FOR_TASK"
  | "PREFER_EMPLOYEE_TASK"
  | "AVOID_EMPLOYEE_TASK"
  | "PRIORITY_BOOST"
  | "PRIORITY_PENALTY"
  | "PREFERRED_DAY"
  | "MIN_ASSIGNMENTS"
  | "MAX_ASSIGNMENTS"
  | "BACKUP_ONLY"
  | "SKILL_WEIGHT"
  | "CUSTOM";

export type SchedulerRule = {
  id: string;
  type: SchedulerRuleType;
  employeeId?: string | null;
  taskTypeId?: string | null;
  weight: number;
  priority?: number;
  active?: boolean;
  effectiveStartDate?: IsoDate | null;
  effectiveEndDate?: IsoDate | null;
  parameters?: Record<string, unknown> | null;
};

export type GenerateScheduleInput = {
  seed: string;
  employees: SchedulerEmployee[];
  taskTypes: SchedulerTaskType[];
  slots: SchedulerTaskSlot[];
  rules?: SchedulerRule[];
  existingAssignments?: ExistingAssignment[];
};

export type ScheduleAssignment = {
  slotId: string;
  employeeId: string;
  taskTypeId: string;
  date: IsoDate;
  source: "GENERATED" | "LOCKED" | "COVERAGE_REPLACEMENT";
  score: number;
};

export type CandidateRejection = {
  employeeId: string;
  reasons: string[];
};

export type ScheduleConflict = {
  slotId: string;
  taskTypeId: string;
  date: IsoDate;
  reason: string;
  rejectedCandidates: CandidateRejection[];
};

export type ScheduleResult = {
  assignments: ScheduleAssignment[];
  conflicts: ScheduleConflict[];
  diagnostics: {
    seed: string;
    slotCount: number;
    assignmentCount: number;
    conflictCount: number;
  };
};
