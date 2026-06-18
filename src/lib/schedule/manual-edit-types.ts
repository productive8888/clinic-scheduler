export type ManualEditAssignmentChange = {
  assignmentId: string;
  employeeId: string | null;
  locked: boolean;
  note?: string | null;
};

export type ManualEditAddedAssignment = {
  clientId: string;
  slotId: string;
  employeeId: string;
  locked: boolean;
  note?: string | null;
};

export type ManualEditAddedSlot = {
  clientId: string;
  date: string;
  shiftBlockId: string;
  taskTypeId: string;
  employeeId: string | null;
  locked: boolean;
  note?: string | null;
};

export type ManualEditBatch = {
  weekStart: string;
  revisions: Array<{
    scheduleDayId: string;
    updatedAt: string;
  }>;
  assignmentChanges: ManualEditAssignmentChange[];
  addedAssignments: ManualEditAddedAssignment[];
  addedSlots: ManualEditAddedSlot[];
  overrideReason?: string | null;
};

export type ManualEditSeverity =
  | "SAFE"
  | "WARNING"
  | "OVERRIDE_REQUIRED"
  | "BLOCKER";

export type ManualEditDiagnostic = {
  severity: Exclude<ManualEditSeverity, "SAFE">;
  code: string;
  message: string;
  employeeId?: string | null;
  assignmentId?: string | null;
  slotId?: string | null;
  date?: string | null;
};

export type ManualEditPreview = {
  severity: ManualEditSeverity;
  diagnostics: ManualEditDiagnostic[];
  safeChangeCount: number;
  warningCount: number;
  overrideRequiredCount: number;
  blockerCount: number;
  affectedEmployeeHours: Array<{
    employeeId: string;
    employeeName: string;
    beforeHours: number;
    afterHours: number;
    targetHours: number;
  }>;
  resolvedHardIssueCount: number;
};

export type ManualEditCandidate = {
  employeeId: string;
  employeeName: string;
  projectedHours: number;
  targetHours: number;
  severity: ManualEditSeverity;
  warningCodes: string[];
  warningMessages: string[];
};
