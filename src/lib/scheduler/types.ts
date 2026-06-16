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
  historicalClinicalAssignments?: number;
  historicalPatientFacingAssignments?: number;
  historicalScheduledHours?: number;
  historicalSaturdayAssignments?: number;
  historicalEndoscopyAssignments?: number;
  targetWeeklyHours?: number | null;
  scheduledHoursThisWeek?: number;
  scheduledBackgroundAssignmentsThisWeek?: number;
  scheduledEarlyStartShiftsThisWeek?: number;
  requiredBackgroundAssignments?: number;
  workPattern?: {
    code?: string | null;
    kind?: "CUSTOM" | "ENDOSCOPY_SATURDAY" | "NON_ENDOSCOPY_SATURDAY";
    targetWeeklyHours?: number | null;
    worksTuesdayThroughSaturday?: boolean;
    saturdayPaidHours?: number | null;
    requiredSaturdayShiftCategory?: "AM" | "PM" | "SATURDAY" | "ENDO" | "FLOAT" | "OTHER" | null;
    extraHourWeekdays?: number[];
    mondayOffAllowed?: boolean;
    fridayOffAllowed?: boolean;
    earlyStartDaysPerWeek?: number;
  } | null;
  targetTaskAssignments?: Record<string, number>;
  targetPatientFacingAssignments?: number | null;
  exposureGoals?: string[];
  julyWeekSkeleton?: EmployeeWeekSkeleton | null;
};

export type EmployeeWeekSkeleton = {
  employeeId: string;
  groupLabel: string;
  targetHours: number;
  allowedShiftBlockIds: string[];
  requiredShiftBlockIds: string[];
  forbiddenShiftBlockIds: string[];
  requiredSaturdayShiftBlockId: string | null;
  requiredExtraHourWeekdays: number[];
  plannedDays: Array<{
    date: string;
    kind:
      | "NORMAL_FULL_DAY"
      | "EXTENDED_FULL_DAY"
      | "SATURDAY_ENDO"
      | "SATURDAY_REGULAR"
      | "OFF";
    allowedShiftBlockIds: string[];
    requiredShiftBlockIds: string[];
  }>;
};

export type SchedulerTaskType = {
  id: string;
  code: string;
  name: string;
  requiredSkillIds: string[];
  interchangeableGroup?: string | null;
  difficultyWeight?: number;
  sortOrder?: number;
  isPatientFacing?: boolean;
  isClinical?: boolean;
  isBackground?: boolean;
  isSkilled?: boolean;
  isEndoscopy?: boolean;
  isFloat?: boolean;
  isClosureCandidate?: boolean;
  exposureGroup?: string | null;
};

export type SchedulerTaskSlot = {
  id: string;
  date: IsoDate;
  shiftBlockId?: string | null;
  shiftTemplateId?: string | null;
  shiftCategory?: "AM" | "PM" | "SATURDAY" | "ENDO" | "FLOAT" | "OTHER";
  shiftName?: string | null;
  paidHours?: number | null;
  taskTypeId: string;
  slotIndex: number;
  requirementLevel?: "REQUIRED" | "DESIRED" | "OPTIONAL" | "CONDITIONAL";
  startMinute?: number | null;
  endMinute?: number | null;
  minStaff?: number;
  requiredStaff?: number;
  lockedEmployeeId?: string | null;
  lockedEmployeeIds?: string[];
  reservedEmployeeIds?: string[];
  patternPreferredEmployeeIds?: string[];
  requiredSkillIds?: string[];
  eligibleEmployeeIds?: string[];
  canBePulledForClinic?: boolean;
  protectedFromPull?: boolean;
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
  shiftBlockId?: string | null;
  shiftCategory?: SchedulerTaskSlot["shiftCategory"];
  paidHours?: number | null;
  isPatientFacing?: boolean;
  isClinical?: boolean;
  isBackground?: boolean;
  isFloat?: boolean;
  isEndoscopy?: boolean;
  canBePulledForClinic?: boolean;
  protectedFromPull?: boolean;
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
  fairness?: SchedulerFairnessSettings;
};

export type SchedulerFairnessSettings = {
  clinicalShiftWeight: number;
  patientFacingShiftWeight: number;
  totalShiftWeight: number;
  totalHoursWeight: number;
  saturdayShiftWeight: number;
  endoscopyShiftWeight: number;
  patternConsistencyWeight: number;
  skillRoleBalanceWeight: number;
  exposureGoalWeight: number;
  backgroundPenaltyWeight: number;
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

export type ScheduleRepair = {
  targetSlotId: string;
  displacedSlotId: string;
  strategy: "SWAP" | "PULL_FLOAT" | "PULL_BACKGROUND";
  employeeId: string;
  replacementEmployeeId?: string | null;
};

export type ScheduleResult = {
  assignments: ScheduleAssignment[];
  conflicts: ScheduleConflict[];
  repairs: ScheduleRepair[];
  diagnostics: {
    seed: string;
    slotCount: number;
    assignmentCount: number;
    conflictCount: number;
    repairCount: number;
  };
};
