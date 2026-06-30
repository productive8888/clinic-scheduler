import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";
import { backgroundTaskDisplayName } from "../../src/lib/background/display";
import { selectBackgroundPullCandidates } from "../../src/lib/background/pull-priority";
import {
  backgroundSlotCount,
  enumerateBackgroundPeriods,
} from "../../src/lib/background/periods";
import {
  generateSchedule,
  isUnavailableForSlot,
  resolveDirectReplacement,
  type SchedulerEmployee,
  type SchedulerTaskSlot,
  type SchedulerTaskType,
} from "../../src/lib/scheduler";
import {
  parseEastonSkillCodes,
  parseEastonWorkbook,
} from "../../src/lib/easton-import/parser";
import {
  findEastonTargetForEmployee,
  findEmployeeForEastonTarget,
} from "../../src/lib/easton-import/employee-targets";
import {
  eastonEmployeeProfileUpdateFromTarget,
  eastonShiftTemplateDataFromShift,
  mergeImportedEmployeeSkillCodes,
} from "../../src/lib/db/easton-import";
import {
  buildLiteralBgRoleMixDiagnostics,
  selectExistingBackgroundTopOffSlot,
  selectBackgroundMinimumBackfillCandidate,
  selectBackgroundMinimumConversionCandidate,
  selectLiteralBgSwapCandidate,
} from "../../src/lib/db/background-top-off";
import {
  applyPatientAssignmentSwapInMemory,
  buildPatientDiagnosticMap,
  selectPatientDiversitySwapCandidate,
  selectPatientRangeSwapCandidate,
  type PatientRepairEmployee,
  type PatientRepairSlot,
} from "../../src/lib/db/patient-fairness-repair";
import {
  getEffectiveRequiredBackgroundAssignments,
  getEffectiveWorkPattern,
} from "../../src/lib/schedule/easton-work-pattern-resolution";
import {
  eastonDerivedAvailabilityWindows,
  withEastonDerivedAvailability,
} from "../../src/lib/schedule/easton-derived-availability";
import { evaluateWeeklyHardRequirements } from "../../src/lib/schedule/hard-requirements";
import {
  isExtraHourShiftForWeekday,
  validateEmployeeWeekPattern,
} from "../../src/lib/schedule/work-pattern-requirements";
import { buildJulyWeekSkeletons } from "../../src/lib/schedule/july-week-planner";
import { buildJulySaturdayReservationPlan } from "../../src/lib/schedule/july-saturday-reservations";
import { weekdayShortName } from "../../src/lib/easton-import/work-patterns";
import {
  invalidatedScheduleDayData,
  invalidatedTaskSlotStatus,
} from "../../src/lib/db/employee-schedule-invalidation";
import {
  calculatePtoHours,
  deductsPtoBalance,
  isAutoApprovedPtoType,
  requiresManagerApproval,
  wouldPutPtoBalanceBelowFloor,
} from "../../src/lib/pto/policy";
import {
  calculateNptoHours,
  isScheduleBlockingNptoStatus,
  nptoDeductsPtoBalance,
  wouldExceedNptoCap,
} from "../../src/lib/npto/policy";
import { calculateOptoAdjustment } from "../../src/lib/opto/adjustment";
import {
  calculateOvertimeApproval,
  calculateOvertimeReversal,
} from "../../src/lib/overtime/policy";
import { buildStaffingAnalytics } from "../../src/lib/analytics/staffing";
import { buildAssignmentCalendarEvents } from "../../src/lib/calendar/events";
import { buildIcsCalendar } from "../../src/lib/calendar/ics";
import { icsResponse } from "../../src/lib/calendar/http";
import { selectDefaultTaskTypesForScenario } from "../../src/lib/schedule/scenarios";
import { validateManualAssignment } from "../../src/lib/schedule/manual-validation";
import { applyManualEditBatchToState } from "../../src/lib/schedule/manual-edit-state";
import { getSchedulePublishIssues } from "../../src/lib/schedule/publish-validation";
import {
  clinicWeekRange,
  groupScheduleDatesByClinicWeek,
  monthCalendarRange,
  partialGenerationWeekStarts,
  PUBLISHED_DAYS_PARTIAL_GENERATION_WARNING,
  planScheduleGeneration,
  planScheduleRange,
  planUnpublishScheduleRange,
  resolveScheduleRange,
} from "../../src/lib/schedule/range";
import {
  ACTIVE_EASTON_TARGET_PATTERN_CODE,
  eastonTargetPatternCodeForDate,
  isActiveEastonModelDate,
} from "../../src/lib/schedule/easton-model";
import { getMonthDayPresentation } from "../../src/lib/schedule/month";
import {
  buildWeekStaffSummary,
  buildWeekDayHealth,
  buildWholeDayShiftGroups,
  summarizeShiftBlocks,
} from "../../src/lib/schedule/views";
import { shouldPreserveSlotOutsideStaffingRequirements } from "../../src/lib/schedule/slot-reconciliation";
import { EMPLOYEE_BG_MINIMUM_SOURCE } from "../../src/lib/schedule/employee-bg-minimum";
import {
  isJulyPatientShiftTaskCode,
  julyPatientShiftGroupFromTaskCode,
} from "../../src/lib/schedule/patient-shifts";
import {
  buildPatientFairnessDiagnostic,
  JULY_PATIENT_SHIFT_MAXIMUM,
  JULY_PATIENT_SHIFT_MINIMUM,
} from "../../src/lib/schedule/patient-fairness";
import {
  isShortNoticeForDateRange,
  isShortNoticeScheduleChange,
} from "../../src/lib/schedule/short-notice";
import {
  selectSafeDefaultShiftBlockId,
  selectStaffingSlotSpecs,
} from "../../src/lib/staffing/requirements";
import { selectShortageRecommendations } from "../../src/lib/shortage/recommendations";
import { buildShiftBlockSnapshot } from "../../src/lib/shifts/templates";
import { managerVisibleShiftBlocks } from "../../src/lib/shifts/legacy";
import { enumerateIsoDates } from "../../src/lib/utils/date";
import {
  REQUIRED_CONFIGURABLE_SKILLS,
  REQUIRED_TASK_SKILL_CODES,
} from "../../src/lib/skills/catalog";
import { employeeFormSchema } from "../../src/lib/validation/employee";
import { overtimeEntrySchema } from "../../src/lib/validation/overtime";

const monday = "2026-06-01";
const saturday = "2026-06-06";
const defaultShiftBlock = {
  id: "am-regular-block",
  shiftTemplateId: "am-regular-template",
  shiftCategory: "AM" as const,
  startMinute: 8 * 60,
  defaultForSchedule: true,
};
const pmShiftBlock = {
  id: "pm-regular-block",
  shiftTemplateId: "pm-regular-template",
  shiftCategory: "PM" as const,
  startMinute: 13 * 60,
  defaultForSchedule: false,
};
const saturdayShiftBlock = {
  id: "saturday-shorter-block",
  shiftTemplateId: "saturday-shorter-template",
  shiftCategory: "SATURDAY" as const,
  startMinute: 8 * 60,
  defaultForSchedule: true,
};
const allDayMonday = [
  {
    weekday: 1,
    startMinute: 0,
    endMinute: 1440,
    effectiveStartDate: "2026-01-01",
  },
];
const allDaySaturday = [
  {
    weekday: 6,
    startMinute: 0,
    endMinute: 1440,
    effectiveStartDate: "2026-01-01",
  },
];
const mondayThroughFriday = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 0,
  endMinute: 1440,
  effectiveStartDate: "2026-01-01",
}));
const defaultSlot: SchedulerTaskSlot = {
  id: "default-slot",
  date: monday,
  shiftBlockId: defaultShiftBlock.id,
  shiftTemplateId: defaultShiftBlock.shiftTemplateId,
  shiftCategory: "AM",
  shiftName: "AM regular",
  paidHours: 4,
  taskTypeId: "task",
  slotIndex: 1,
  startMinute: 8 * 60,
  endMinute: 12 * 60,
  requirementLevel: "REQUIRED",
  requiredStaff: 1,
};

function baseEmployee(id: string, fullName: string): SchedulerEmployee {
  return {
    id,
    fullName,
    skillIds: [],
    availability: allDayMonday,
  };
}

function patientFairnessTarget(employeeId: string, employeeName: string) {
  return {
    employeeId,
    employeeName,
    scheduleEligibility: "ACTIVE_SCHEDULED",
    workPatternCode: null,
    requiresWorkPattern: false,
    requiredBackgroundAssignments: 0,
    extraHourWeekdays: [],
    expectedWeeklyHours: 40,
  };
}

function patientFairnessAssignment(
  employeeId: string,
  taskTypeCode: string,
  index: number,
) {
  return {
    employeeId,
    date: `2026-07-${String(6 + index).padStart(2, "0")}`,
    shiftBlockId: `patient-shift-${index}`,
    shiftCategory: "AM",
    startMinute: 8 * 60,
    endMinute: 12 * 60,
    paidHours: 4,
    taskTypeCode,
    isBackground: false,
  };
}

function patientRepairEmployee(
  id: string,
  fullName: string,
): PatientRepairEmployee {
  return {
    id,
    fullName,
    active: true,
    skillIds: [],
    availability: [1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      startMinute: 0,
      endMinute: 24 * 60,
      active: true,
    })),
    unavailable: [],
    weeklyAssignmentLimit: null,
    targetWeeklyHours: 40,
    expectedHours: 40,
    requiredBackgroundAssignments: 0,
    workPattern: null,
  };
}

function patientRepairSlot(input: {
  id: string;
  date: string;
  taskTypeCode: string;
  employeeId: string;
  isBackground?: boolean;
  shiftCategory?: SchedulerTaskSlot["shiftCategory"];
  startMinute?: number;
  endMinute?: number;
  paidHours?: number;
}): PatientRepairSlot {
  const startMinute = input.startMinute ?? 8 * 60;
  const endMinute = input.endMinute ?? 12 * 60;
  const patientGroup = julyPatientShiftGroupFromTaskCode(
    input.taskTypeCode,
  );

  return {
    id: input.id,
    date: input.date,
    scheduleDayId: `day-${input.date}`,
    scheduleDayStatus: "GENERATED",
    shiftBlockId: `block-${input.id}`,
    shiftTemplateId: `template-${input.id}`,
    shiftCategory: input.shiftCategory ?? "AM",
    shiftName: `Shift ${input.id}`,
    paidHours: input.paidHours ?? (endMinute - startMinute) / 60,
    taskTypeId: `task-${input.taskTypeCode}`,
    slotIndex: 1,
    requirementLevel: "REQUIRED",
    startMinute,
    endMinute,
    minStaff: 1,
    requiredStaff: 1,
    requiredSkillIds: [],
    eligibleEmployeeIds: [],
    canBePulledForClinic: false,
    protectedFromPull: false,
    source: "STAFFING_RULE",
    taskType: {
      id: `task-${input.taskTypeCode}`,
      code: input.taskTypeCode,
      name: input.taskTypeCode.replaceAll("_", " "),
      requiredSkillIds: [],
      isPatientFacing: Boolean(patientGroup),
      isClinical: Boolean(patientGroup),
      isBackground: input.isBackground ?? false,
      isSkilled: false,
      isEndoscopy: input.taskTypeCode === "ENDOSCOPY",
      isFloat: input.taskTypeCode === "FLOAT",
      exposureGroup: patientGroup,
    },
    assignments: [
      {
        id: `assignment-${input.id}`,
        employeeId: input.employeeId,
        locked: false,
        source: "GENERATED",
      },
    ],
  };
}

function patientRepairExistingAssignments(slots: PatientRepairSlot[]) {
  return slots.flatMap((slot) =>
    slot.assignments.map((assignment) => ({
      slotId: slot.id,
      employeeId: assignment.employeeId,
      date: slot.date,
      taskTypeId: slot.taskTypeId,
      startMinute: slot.startMinute,
      endMinute: slot.endMinute,
      shiftBlockId: slot.shiftBlockId,
      shiftCategory: slot.shiftCategory,
      paidHours: slot.paidHours,
      isPatientFacing: Boolean(
        julyPatientShiftGroupFromTaskCode(slot.taskType.code),
      ),
      isClinical: slot.taskType.isClinical,
      isBackground: slot.taskType.isBackground,
      isFloat: slot.taskType.isFloat,
      isEndoscopy: slot.taskType.isEndoscopy,
      exposureGroup: julyPatientShiftGroupFromTaskCode(slot.taskType.code),
      canBePulledForClinic: slot.canBePulledForClinic,
      protectedFromPull: slot.protectedFromPull,
      locked: assignment.locked,
    })),
  );
}

function shift(
  date: string,
  shiftBlockId: string,
  shiftCategory: string,
  startMinute: number,
  endMinute: number,
  paidHours: number,
) {
  return {
    date,
    shiftBlockId,
    shiftCategory,
    startMinute,
    endMinute,
    paidHours,
  };
}

function julyWeekShiftBlocks() {
  return [
    block("mon-early", "2026-07-06", "AM", 420, 720, 5),
    block("mon-am", "2026-07-06", "AM", 480, 720, 4),
    block("mon-long-pm", "2026-07-06", "PM", 780, 1080, 5),
    block("mon-pm", "2026-07-06", "PM", 780, 1020, 4),
    block("tue-early", "2026-07-07", "AM", 420, 720, 5),
    block("tue-am", "2026-07-07", "AM", 480, 720, 4),
    block("tue-pm", "2026-07-07", "PM", 780, 1020, 4),
    block("wed-early", "2026-07-08", "AM", 420, 720, 5),
    block("wed-am", "2026-07-08", "AM", 480, 720, 4),
    block("wed-pm", "2026-07-08", "PM", 780, 1020, 4),
    block("thu-early", "2026-07-09", "AM", 420, 720, 5),
    block("thu-am", "2026-07-09", "AM", 480, 720, 4),
    block("thu-pm", "2026-07-09", "PM", 780, 1020, 4),
    block("fri-am", "2026-07-10", "AM", 480, 720, 4),
    block("fri-pm", "2026-07-10", "PM", 780, 1020, 4),
    block("sat-endo", "2026-07-11", "ENDO", 360, 840, 8),
    block("sat-short", "2026-07-11", "SATURDAY", 480, 840, 6),
  ];
}

function block(
  id: string,
  date: string,
  shiftCategory: string,
  startMinute: number,
  endMinute: number,
  paidHours: number,
) {
  return {
    id,
    date,
    shiftCategory: shiftCategory as SchedulerTaskSlot["shiftCategory"],
    startMinute,
    endMinute,
    paidHours,
  };
}

const taskTypes: SchedulerTaskType[] = [
  {
    id: "front-desk",
    code: "FRONT_DESK",
    name: "Front Desk",
    requiredSkillIds: [],
    sortOrder: 10,
  },
  {
    id: "civil-surgeon",
    code: "CIVIL_SURGEON",
    name: "Civil Surgeon",
    requiredSkillIds: ["civil-surgeon"],
    difficultyWeight: 3,
    sortOrder: 20,
  },
];

const baseEmployees: SchedulerEmployee[] = [
  {
    id: "alice",
    fullName: "Alice Admin",
    skillIds: ["civil-surgeon"],
    availability: allDayMonday,
    historicalAssignments: 2,
  },
  {
    id: "blake",
    fullName: "Blake Backup",
    skillIds: [],
    availability: allDayMonday,
    historicalAssignments: 0,
  },
];

const slots: SchedulerTaskSlot[] = [
  {
    id: "civil-slot",
    date: monday,
    taskTypeId: "civil-surgeon",
    slotIndex: 1,
    startMinute: 540,
    endMinute: 720,
  },
  {
    id: "front-slot",
    date: monday,
    taskTypeId: "front-desk",
    slotIndex: 1,
    startMinute: 540,
    endMinute: 720,
  },
];

describe("generateSchedule", () => {
  it("enforces skills and prevents double-booking", () => {
    const result = generateSchedule({
      seed: "clinic-demo",
      employees: baseEmployees,
      taskTypes,
      slots,
    });

    assert.equal(result.conflicts.length, 0);
    assert.deepEqual(
      result.assignments.map((assignment) => [
        assignment.slotId,
        assignment.employeeId,
      ]),
      [
        ["civil-slot", "alice"],
        ["front-slot", "blake"],
      ],
    );
  });

  it("enforces approved PTO and reports shortages", () => {
    const result = generateSchedule({
      seed: "clinic-demo",
      employees: [
        {
          ...baseEmployees[0],
          unavailable: [{ startDate: monday, endDate: monday }],
        },
      ],
      taskTypes,
      slots: [slots[0]],
    });

    assert.equal(result.assignments.length, 0);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].reason, "No compatible available employee");
    assert.equal(
      result.conflicts[0].rejectedCandidates[0].reasons.includes(
        "PTO or approved unavailability",
      ),
      true,
    );
  });

  it("is deterministic for the same inputs and seed", () => {
    const first = generateSchedule({
      seed: "repeatable",
      employees: baseEmployees,
      taskTypes,
      slots,
    });
    const second = generateSchedule({
      seed: "repeatable",
      employees: baseEmployees,
      taskTypes,
      slots,
    });

    assert.deepEqual(first, second);
  });

  it("only assigns employees on configured working days", () => {
    const result = generateSchedule({
      seed: "configured-working-days",
      employees: [
        {
          id: "tuesday-only",
          fullName: "Tuesday Only",
          skillIds: [],
          availability: [
            {
              weekday: 2,
              startMinute: 0,
              endMinute: 1440,
              effectiveStartDate: "2026-01-01",
            },
          ],
        },
      ],
      taskTypes,
      slots: [slots[1]],
    });

    assert.equal(result.assignments.length, 0);
    assert.equal(result.conflicts.length, 1);
    assert.equal(
      result.conflicts[0].rejectedCandidates[0].reasons.includes(
        "Outside weekly availability",
      ),
      true,
    );
  });

  it("assigns Saturday workers to Saturday tasks", () => {
    const result = generateSchedule({
      seed: "saturday-worker",
      employees: [
        {
          id: "weekday-only",
          fullName: "Weekday Only",
          skillIds: [],
          availability: mondayThroughFriday,
        },
        {
          id: "saturday-worker",
          fullName: "Saturday Worker",
          skillIds: [],
          availability: allDaySaturday,
        },
      ],
      taskTypes,
      slots: [
        {
          ...slots[1],
          id: "saturday-front-slot",
          date: saturday,
        },
      ],
    });

    assert.equal(result.conflicts.length, 0);
    assert.equal(result.assignments[0].employeeId, "saturday-worker");
  });

  it("does not assign Monday-Friday-only employees on Saturdays", () => {
    const result = generateSchedule({
      seed: "weekday-only-saturday",
      employees: [
        {
          id: "weekday-only",
          fullName: "Weekday Only",
          skillIds: [],
          availability: mondayThroughFriday,
        },
      ],
      taskTypes,
      slots: [
        {
          ...slots[1],
          id: "saturday-front-slot",
          date: saturday,
        },
      ],
    });

    assert.equal(result.assignments.length, 0);
    assert.equal(result.conflicts.length, 1);
    assert.equal(
      result.conflicts[0].rejectedCandidates[0].reasons.includes(
        "Outside weekly availability",
      ),
      true,
    );
  });

  it("lets PTO override a normal working day", () => {
    const result = generateSchedule({
      seed: "pto-overrides-normal-shift",
      employees: [
        {
          id: "saturday-worker",
          fullName: "Saturday Worker",
          skillIds: [],
          availability: allDaySaturday,
          unavailable: [{ startDate: saturday, endDate: saturday }],
        },
      ],
      taskTypes,
      slots: [
        {
          ...slots[1],
          id: "saturday-front-slot",
          date: saturday,
        },
      ],
    });

    assert.equal(result.assignments.length, 0);
    assert.equal(result.conflicts.length, 1);
    assert.equal(
      result.conflicts[0].rejectedCandidates[0].reasons.includes(
        "PTO or approved unavailability",
      ),
      true,
    );
  });

  it("restores availability when a PTO window is reversed", () => {
    const blocked = generateSchedule({
      seed: "pto-before-reversal",
      employees: [
        {
          id: "available-after-reversal",
          fullName: "Available After Reversal",
          skillIds: [],
          availability: allDayMonday,
          unavailable: [{ startDate: monday, endDate: monday }],
        },
      ],
      taskTypes,
      slots: [slots[1]],
    });
    const restored = generateSchedule({
      seed: "pto-after-reversal",
      employees: [
        {
          id: "available-after-reversal",
          fullName: "Available After Reversal",
          skillIds: [],
          availability: allDayMonday,
          unavailable: [],
        },
      ],
      taskTypes,
      slots: [slots[1]],
    });

    assert.equal(blocked.assignments.length, 0);
    assert.equal(restored.assignments[0].employeeId, "available-after-reversal");
  });

  it("preserves locked manual overrides during generation", () => {
    const result = generateSchedule({
      seed: "override-preservation",
      employees: baseEmployees,
      taskTypes,
      slots: [
        {
          ...slots[1],
          lockedEmployeeIds: ["blake"],
        },
        slots[0],
      ],
    });

    assert.equal(result.conflicts.length, 0);
    assert.deepEqual(
      result.assignments.map((assignment) => [
        assignment.slotId,
        assignment.employeeId,
        assignment.source,
      ]),
      [
        ["civil-slot", "alice", "GENERATED"],
        ["front-slot", "blake", "LOCKED"],
      ],
    );
  });

  it("preserves locked manual overrides even when PTO later conflicts", () => {
    const result = generateSchedule({
      seed: "pto-override-preservation",
      employees: [
        {
          ...baseEmployees[1],
          unavailable: [{ startDate: monday, endDate: monday }],
        },
      ],
      taskTypes,
      slots: [
        {
          ...slots[1],
          lockedEmployeeIds: ["blake"],
        },
      ],
    });

    assert.equal(result.conflicts.length, 0);
    assert.deepEqual(
      result.assignments.map((assignment) => [
        assignment.slotId,
        assignment.employeeId,
        assignment.source,
      ]),
      [["front-slot", "blake", "LOCKED"]],
    );
  });

  it("uses preferred employee-task rules to affect assignment order", () => {
    const result = generateSchedule({
      seed: "rule-preference",
      employees: baseEmployees,
      taskTypes,
      slots: [slots[1]],
      rules: [
        {
          id: "prefer-alice-front-desk",
          type: "PREFER_EMPLOYEE_FOR_TASK",
          employeeId: "alice",
          taskTypeId: "front-desk",
          weight: 100,
          active: true,
        },
      ],
    });

    assert.equal(result.conflicts.length, 0);
    assert.equal(result.assignments[0].employeeId, "alice");
  });

  it("uses week-to-week pattern preferences as a soft scoring signal", () => {
    const result = generateSchedule({
      seed: "pattern-consistency",
      employees: baseEmployees,
      taskTypes,
      slots: [
        {
          ...slots[1],
          patternPreferredEmployeeIds: ["blake"],
        },
      ],
      fairness: {
        clinicalShiftWeight: 0,
        patientFacingShiftWeight: 0,
        totalShiftWeight: 0,
        totalHoursWeight: 0,
        saturdayShiftWeight: 0,
        endoscopyShiftWeight: 0,
        patternConsistencyWeight: 100,
        skillRoleBalanceWeight: 0,
        exposureGoalWeight: 0,
        backgroundPenaltyWeight: 0,
      },
    });

    assert.equal(result.assignments[0].employeeId, "blake");
  });

  it("balances patient-facing shifts before general total-hour fairness", () => {
    const patientTaskTypes = [
      {
        id: "new-gi",
        code: "NEW_GI",
        name: "New GI",
        requiredSkillIds: [],
        isPatientFacing: true,
        isClinical: true,
      },
    ];
    const result = generateSchedule({
      seed: "patient-facing-fairness",
      employees: [
        {
          id: "overused",
          fullName: "Overused",
          skillIds: [],
          availability: allDayMonday,
          historicalPatientFacingAssignments: 10,
        },
        {
          id: "underused",
          fullName: "Underused",
          skillIds: [],
          availability: allDayMonday,
          historicalPatientFacingAssignments: 0,
        },
      ],
      taskTypes: patientTaskTypes,
      slots: [{ ...slots[1], taskTypeId: "new-gi" }],
      fairness: {
        clinicalShiftWeight: 0,
        patientFacingShiftWeight: 20,
        totalShiftWeight: 0,
        totalHoursWeight: 0,
        saturdayShiftWeight: 0,
        endoscopyShiftWeight: 0,
        patternConsistencyWeight: 0,
        skillRoleBalanceWeight: 0,
        exposureGoalWeight: 0,
        backgroundPenaltyWeight: 0,
      },
    });

    assert.equal(result.assignments[0].employeeId, "underused");
  });

  it("uses per-role targets among eligible employees as a soft objective", () => {
    const result = generateSchedule({
      seed: "role-targets",
      employees: [
        {
          id: "needs-front",
          fullName: "Needs Front",
          skillIds: [],
          availability: allDayMonday,
          targetTaskAssignments: { "front-desk": 2 },
        },
        {
          id: "neutral",
          fullName: "Neutral",
          skillIds: [],
          availability: allDayMonday,
        },
      ],
      taskTypes,
      slots: [slots[1]],
      fairness: {
        clinicalShiftWeight: 0,
        patientFacingShiftWeight: 0,
        totalShiftWeight: 0,
        totalHoursWeight: 0,
        saturdayShiftWeight: 0,
        endoscopyShiftWeight: 0,
        patternConsistencyWeight: 0,
        skillRoleBalanceWeight: 50,
        exposureGoalWeight: 0,
        backgroundPenaltyWeight: 0,
      },
    });

    assert.equal(result.assignments[0].employeeId, "needs-front");
  });

  it("uses GI Allergy PCP exposure goals as soft assignment goals", () => {
    const giTaskTypes = [
      {
        id: "new-gi",
        code: "NEW_GI",
        name: "New GI",
        requiredSkillIds: [],
        exposureGroup: "GI",
      },
    ];
    const result = generateSchedule({
      seed: "exposure-goals",
      employees: [
        {
          id: "needs-gi",
          fullName: "Needs GI",
          skillIds: [],
          availability: allDayMonday,
          exposureGoals: ["GI"],
        },
        {
          id: "neutral",
          fullName: "Neutral",
          skillIds: [],
          availability: allDayMonday,
        },
      ],
      taskTypes: giTaskTypes,
      slots: [{ ...slots[1], taskTypeId: "new-gi" }],
      fairness: {
        clinicalShiftWeight: 0,
        patientFacingShiftWeight: 0,
        totalShiftWeight: 0,
        totalHoursWeight: 0,
        saturdayShiftWeight: 0,
        endoscopyShiftWeight: 0,
        patternConsistencyWeight: 0,
        skillRoleBalanceWeight: 0,
        exposureGoalWeight: 25,
        backgroundPenaltyWeight: 0,
      },
    });

    assert.equal(result.assignments[0].employeeId, "needs-gi");
  });

  it("does not let fairness close a fillable required clinic slot", () => {
    const result = generateSchedule({
      seed: "fillable-required",
      employees: [
        {
          id: "skilled-overused",
          fullName: "Skilled Overused",
          skillIds: ["civil-surgeon"],
          availability: allDayMonday,
          historicalPatientFacingAssignments: 999,
          historicalClinicalAssignments: 999,
        },
      ],
      taskTypes,
      slots: [slots[0]],
      fairness: {
        clinicalShiftWeight: 200,
        patientFacingShiftWeight: 200,
        totalShiftWeight: 200,
        totalHoursWeight: 200,
        saturdayShiftWeight: 0,
        endoscopyShiftWeight: 0,
        patternConsistencyWeight: 0,
        skillRoleBalanceWeight: 0,
        exposureGoalWeight: 0,
        backgroundPenaltyWeight: 0,
      },
    });

    assert.equal(result.conflicts.length, 0);
    assert.equal(result.assignments[0].employeeId, "skilled-overused");
  });

  it("does not let priority rules bypass skills, PTO, availability, or double-booking", () => {
    const missingSkill = generateSchedule({
      seed: "rule-missing-skill",
      employees: baseEmployees,
      taskTypes,
      slots: [slots[0]],
      rules: [
        {
          id: "prefer-unskilled-civil",
          type: "PREFER_EMPLOYEE_FOR_TASK",
          employeeId: "blake",
          taskTypeId: "civil-surgeon",
          weight: 1000,
          active: true,
        },
      ],
    });

    assert.equal(missingSkill.conflicts.length, 0);
    assert.equal(missingSkill.assignments[0].employeeId, "alice");

    const ptoBlocked = generateSchedule({
      seed: "rule-pto",
      employees: [
        {
          ...baseEmployees[0],
          unavailable: [{ startDate: monday, endDate: monday }],
        },
        baseEmployees[1],
      ],
      taskTypes,
      slots: [slots[1]],
      rules: [
        {
          id: "prefer-pto-employee",
          type: "PREFER_EMPLOYEE_FOR_TASK",
          employeeId: "alice",
          taskTypeId: "front-desk",
          weight: 1000,
          active: true,
        },
      ],
    });

    assert.equal(ptoBlocked.conflicts.length, 0);
    assert.equal(ptoBlocked.assignments[0].employeeId, "blake");

    const unavailableBlocked = generateSchedule({
      seed: "rule-availability",
      employees: [
        {
          ...baseEmployees[0],
          availability: [],
        },
        baseEmployees[1],
      ],
      taskTypes,
      slots: [slots[1]],
      rules: [
        {
          id: "prefer-unavailable-employee",
          type: "PREFER_EMPLOYEE_FOR_TASK",
          employeeId: "alice",
          taskTypeId: "front-desk",
          weight: 1000,
          active: true,
        },
      ],
    });

    assert.equal(unavailableBlocked.conflicts.length, 0);
    assert.equal(unavailableBlocked.assignments[0].employeeId, "blake");

    const doubleBookingBlocked = generateSchedule({
      seed: "rule-double-booking",
      employees: baseEmployees,
      taskTypes,
      slots: [
        slots[1],
        {
          ...slots[1],
          id: "front-slot-2",
          slotIndex: 2,
        },
      ],
      rules: [
        {
          id: "prefer-alice-all-front",
          type: "PREFER_EMPLOYEE_FOR_TASK",
          employeeId: "alice",
          taskTypeId: "front-desk",
          weight: 1000,
          active: true,
        },
      ],
    });

    assert.equal(doubleBookingBlocked.conflicts.length, 0);
    assert.deepEqual(
      doubleBookingBlocked.assignments.map((assignment) => assignment.employeeId),
      ["alice", "blake"],
    );
  });

  it("fills required slots before desired or conditional slots", () => {
    const result = generateSchedule({
      seed: "requirement-order",
      employees: [
        {
          id: "single-employee",
          fullName: "Single Employee",
          skillIds: [],
          availability: allDayMonday,
        },
      ],
      taskTypes,
      slots: [
        {
          id: "desired-front",
          date: monday,
          taskTypeId: "front-desk",
          slotIndex: 2,
          requirementLevel: "DESIRED",
        },
        {
          id: "required-front",
          date: monday,
          taskTypeId: "front-desk",
          slotIndex: 1,
          requirementLevel: "REQUIRED",
        },
      ],
    });

    assert.deepEqual(
      result.assignments.map((assignment) => assignment.slotId),
      ["required-front"],
    );
    assert.equal(result.conflicts[0].slotId, "desired-front");
  });

  it("allows non-overlapping AM and PM assignments for one employee", () => {
    const result = generateSchedule({
      seed: "same-day-non-overlapping-shifts",
      employees: [
        {
          id: "solo",
          fullName: "Solo Staff",
          skillIds: [],
          availability: allDayMonday,
        },
      ],
      taskTypes,
      slots: [
        {
          id: "front-morning",
          date: monday,
          taskTypeId: "front-desk",
          slotIndex: 1,
          startMinute: 480,
          endMinute: 600,
        },
        {
          id: "front-afternoon",
          date: monday,
          taskTypeId: "front-desk",
          slotIndex: 2,
          startMinute: 780,
          endMinute: 900,
        },
      ],
    });

    assert.equal(result.assignments.length, 2);
    assert.equal(result.conflicts.length, 0);
  });

  it("rejects overlapping 0700-1200 and 0800-1200 shifts", () => {
    const result = generateSchedule({
      seed: "same-day-overlapping-shifts",
      employees: [
        {
          id: "solo",
          fullName: "Solo Staff",
          skillIds: [],
          availability: allDayMonday,
        },
      ],
      taskTypes,
      slots: [
        {
          id: "early-am",
          date: monday,
          taskTypeId: "front-desk",
          slotIndex: 1,
          startMinute: 420,
          endMinute: 720,
        },
        {
          id: "regular-am",
          date: monday,
          taskTypeId: "front-desk",
          slotIndex: 2,
          startMinute: 480,
          endMinute: 720,
        },
      ],
    });

    assert.equal(result.assignments.length, 1);
    assert.equal(result.conflicts.length, 1);
    assert.equal(
      result.conflicts[0].rejectedCandidates[0].reasons.includes(
        "Would double-book employee",
      ),
      true,
    );
  });

  it("tries another eligible employee when the preferred candidate overlaps", () => {
    const result = generateSchedule({
      seed: "alternate-after-overlap",
      employees: baseEmployees,
      taskTypes,
      slots: [slots[1]],
      existingAssignments: [
        {
          slotId: "existing-slot",
          employeeId: "alice",
          taskTypeId: "front-desk",
          date: monday,
          startMinute: 540,
          endMinute: 720,
        },
      ],
      rules: [
        {
          id: "prefer-alice",
          type: "PREFER_EMPLOYEE_FOR_TASK",
          employeeId: "alice",
          taskTypeId: "front-desk",
          weight: 1000,
        },
      ],
    });

    assert.equal(result.conflicts.length, 0);
    assert.equal(result.assignments[0].employeeId, "blake");
  });

  it("repairs a required clinic shortage with a deterministic assignment swap", () => {
    const result = generateSchedule({
      seed: "required-swap-repair",
      employees: [
        {
          id: "flexible",
          fullName: "Flexible",
          skillIds: [],
          availability: allDayMonday,
        },
        {
          id: "backup",
          fullName: "Backup",
          skillIds: [],
          availability: allDayMonday,
        },
      ],
      taskTypes: [
        {
          id: "general-clinic",
          code: "GENERAL_CLINIC",
          name: "General Clinic",
          requiredSkillIds: [],
          isPatientFacing: true,
          isClinical: true,
        },
        {
          id: "restricted-clinic",
          code: "RESTRICTED_CLINIC",
          name: "Restricted Clinic",
          requiredSkillIds: [],
          isPatientFacing: true,
          isClinical: true,
        },
      ],
      slots: [
        {
          id: "a-general-clinic",
          date: monday,
          taskTypeId: "general-clinic",
          slotIndex: 1,
          startMinute: 480,
          endMinute: 720,
          requirementLevel: "REQUIRED",
        },
        {
          id: "b-restricted-clinic",
          date: monday,
          taskTypeId: "restricted-clinic",
          slotIndex: 1,
          startMinute: 480,
          endMinute: 720,
          requirementLevel: "REQUIRED",
          eligibleEmployeeIds: ["flexible"],
        },
      ],
      rules: [
        {
          id: "prefer-flexible-general",
          type: "PREFER_EMPLOYEE_FOR_TASK",
          employeeId: "flexible",
          taskTypeId: "general-clinic",
          weight: 1000,
        },
      ],
    });

    assert.equal(result.conflicts.length, 0);
    assert.equal(result.repairs[0]?.strategy, "SWAP");
    assert.deepEqual(
      result.assignments.map((assignment) => [
        assignment.slotId,
        assignment.employeeId,
      ]),
      [
        ["a-general-clinic", "backup"],
        ["b-restricted-clinic", "flexible"],
      ],
    );
  });

  it("keeps required clinic coverage ahead of Float work", () => {
    const result = generateSchedule({
      seed: "clinic-before-float",
      employees: [
        {
          id: "one-person",
          fullName: "One Person",
          skillIds: [],
          availability: allDayMonday,
        },
      ],
      taskTypes: [
        {
          id: "clinic",
          code: "CLINIC",
          name: "Clinic",
          requiredSkillIds: [],
          isPatientFacing: true,
          isClinical: true,
        },
        {
          id: "float",
          code: "FLOAT",
          name: "Float",
          requiredSkillIds: [],
          isFloat: true,
        },
      ],
      slots: [
        {
          id: "float-slot",
          date: monday,
          taskTypeId: "float",
          slotIndex: 1,
          startMinute: 480,
          endMinute: 720,
          requirementLevel: "REQUIRED",
        },
        {
          id: "clinic-slot",
          date: monday,
          taskTypeId: "clinic",
          slotIndex: 1,
          startMinute: 480,
          endMinute: 720,
          requirementLevel: "REQUIRED",
        },
      ],
    });

    assert.equal(result.assignments[0].slotId, "clinic-slot");
    assert.equal(result.conflicts[0].slotId, "float-slot");
  });
});

describe("Easton full-week generation foundations", () => {
  it("imports every Shifts + Hours shift as a generated/default-active template", () => {
    const shifts = [
      { weekday: 1, label: "0700~1200 (5)", startMinute: 420, endMinute: 720, paidHours: 5, shiftCategory: "AM" },
      { weekday: 1, label: "0800~1200 (4)", startMinute: 480, endMinute: 720, paidHours: 4, shiftCategory: "AM" },
      { weekday: 1, label: "1300~1800 (5)", startMinute: 780, endMinute: 1080, paidHours: 5, shiftCategory: "PM" },
      { weekday: 2, label: "0700~1200 (5)", startMinute: 420, endMinute: 720, paidHours: 5, shiftCategory: "AM" },
      { weekday: 6, label: "0600~1400 (8)", startMinute: 360, endMinute: 840, paidHours: 8, shiftCategory: "ENDO" },
      { weekday: 6, label: "0800~1400 (6)", startMinute: 480, endMinute: 840, paidHours: 6, shiftCategory: "SATURDAY" },
    ] as const;

    for (const shift of shifts) {
      const data = eastonShiftTemplateDataFromShift({
        sheetName: "Shifts + Hours",
        column: 1,
        dayLabel: `${weekdayShortName(shift.weekday)} test`,
        ...shift,
      });

      assert.equal(data.active, true);
      assert.equal(data.defaultForSchedule, true);
    }
  });

  it("creates clinic and background demand on the exact AM and PM shift blocks", () => {
    const specs = selectStaffingSlotSpecs({
      date: "2026-06-02",
      scenario: "ROUTINE",
      taskTypes: [
        {
          id: "gi",
          optional: false,
          defaultForRoutine: false,
          defaultForReduced: false,
        },
        {
          id: "background",
          optional: true,
          defaultForRoutine: false,
          defaultForReduced: false,
        },
      ],
      shiftBlocks: [defaultShiftBlock, pmShiftBlock],
      rules: [
        {
          id: "gi-am",
          taskTypeId: "gi",
          shiftTemplateId: defaultShiftBlock.shiftTemplateId,
          weekday: 2,
          scenario: "ROUTINE",
          minRequiredSlots: 4,
          desiredSlots: 4,
          maxSlots: 4,
          requirementLevel: "REQUIRED",
          active: true,
        },
        {
          id: "gi-pm",
          taskTypeId: "gi",
          shiftTemplateId: pmShiftBlock.shiftTemplateId,
          weekday: 2,
          scenario: "ROUTINE",
          minRequiredSlots: 4,
          desiredSlots: 4,
          maxSlots: 4,
          requirementLevel: "REQUIRED",
          active: true,
        },
        {
          id: "background-am",
          taskTypeId: "background",
          shiftTemplateId: defaultShiftBlock.shiftTemplateId,
          weekday: 2,
          scenario: "ROUTINE",
          minRequiredSlots: 0,
          desiredSlots: 3,
          maxSlots: 3,
          requirementLevel: "DESIRED",
          active: true,
        },
        {
          id: "background-pm",
          taskTypeId: "background",
          shiftTemplateId: pmShiftBlock.shiftTemplateId,
          weekday: 2,
          scenario: "ROUTINE",
          minRequiredSlots: 0,
          desiredSlots: 4,
          maxSlots: 4,
          requirementLevel: "DESIRED",
          active: true,
        },
      ],
    });

    assert.equal(
      specs.filter(
        (spec) =>
          spec.shiftBlockId === defaultShiftBlock.id && spec.taskTypeId === "gi",
      ).length,
      4,
    );
    assert.equal(
      specs.filter(
        (spec) => spec.shiftBlockId === pmShiftBlock.id && spec.taskTypeId === "gi",
      ).length,
      4,
    );
    assert.equal(
      specs.filter(
        (spec) =>
          spec.shiftBlockId === defaultShiftBlock.id &&
          spec.taskTypeId === "background",
      ).length,
      3,
    );
    assert.equal(
      specs.filter(
        (spec) =>
          spec.shiftBlockId === pmShiftBlock.id &&
          spec.taskTypeId === "background",
      ).length,
      4,
    );
  });

  it("creates both configured Saturday blocks and their shift-specific slots", () => {
    const endoscopyBlock = {
      id: "saturday-endo",
      shiftTemplateId: "saturday-endo-template",
      shiftCategory: "ENDO" as const,
      startMinute: 6 * 60,
      defaultForSchedule: false,
    };
    const specs = selectStaffingSlotSpecs({
      date: saturday,
      scenario: "ROUTINE",
      taskTypes: [
        {
          id: "endo",
          optional: false,
          defaultForRoutine: false,
          defaultForReduced: false,
        },
        {
          id: "allergy",
          optional: false,
          defaultForRoutine: false,
          defaultForReduced: false,
        },
      ],
      shiftBlocks: [endoscopyBlock, saturdayShiftBlock],
      rules: [
        {
          id: "endo-saturday",
          taskTypeId: "endo",
          shiftTemplateId: endoscopyBlock.shiftTemplateId,
          weekday: 6,
          scenario: "ROUTINE",
          minRequiredSlots: 8,
          desiredSlots: 8,
          maxSlots: 8,
          requirementLevel: "REQUIRED",
          active: true,
        },
        {
          id: "allergy-saturday",
          taskTypeId: "allergy",
          shiftTemplateId: saturdayShiftBlock.shiftTemplateId,
          weekday: 6,
          scenario: "ROUTINE",
          minRequiredSlots: 4,
          desiredSlots: 4,
          maxSlots: 4,
          requirementLevel: "REQUIRED",
          active: true,
        },
      ],
    });

    assert.equal(
      specs.filter((spec) => spec.shiftBlockId === endoscopyBlock.id).length,
      8,
    );
    assert.equal(
      specs.filter((spec) => spec.shiftBlockId === saturdayShiftBlock.id).length,
      4,
    );
  });

  it("moves assignment selection toward configured weekly target hours", () => {
    const result = generateSchedule({
      seed: "weekly-target-hours",
      employees: [
        {
          id: "nearly-full",
          fullName: "Nearly Full",
          skillIds: [],
          availability: allDayMonday,
          targetWeeklyHours: 40,
          scheduledHoursThisWeek: 36,
        },
        {
          id: "under-target",
          fullName: "Under Target",
          skillIds: [],
          availability: allDayMonday,
          targetWeeklyHours: 40,
          scheduledHoursThisWeek: 8,
        },
      ],
      taskTypes,
      slots: [
        {
          id: "pm-target-slot",
          date: monday,
          taskTypeId: "front-desk",
          slotIndex: 1,
          startMinute: 780,
          endMinute: 1020,
          paidHours: 4,
        },
      ],
    });

    assert.equal(result.assignments[0].employeeId, "under-target");
  });

  it("summarizes AM, PM, and Saturday blocks explicitly", () => {
    assert.deepEqual(
      summarizeShiftBlocks({
        date: "2026-06-02",
        shiftBlocks: [
          {
            shiftCategory: "AM",
            startMinute: 7 * 60,
            endMinute: 12 * 60,
            paidHours: 5,
          },
          {
            shiftCategory: "AM",
            startMinute: 8 * 60,
            endMinute: 12 * 60,
            paidHours: 4,
          },
          {
            shiftCategory: "PM",
            startMinute: 13 * 60,
            endMinute: 17 * 60,
            paidHours: 4,
          },
        ],
      }),
      {
        total: 3,
        am: 2,
        pm: 1,
        saturday: 0,
        amEarly: 1,
        amRegular: 1,
        pmRegular: 1,
        mondayPmLong: 0,
        saturdayEndoscopy: 0,
        saturdayRegular: 0,
      },
    );
    assert.deepEqual(
      summarizeShiftBlocks({
        date: monday,
        shiftBlocks: [
          {
            shiftCategory: "PM",
            startMinute: 13 * 60,
            endMinute: 18 * 60,
            paidHours: 5,
          },
        ],
      }).mondayPmLong,
      1,
    );
    assert.deepEqual(
      summarizeShiftBlocks({
        date: saturday,
        shiftBlocks: [
          {
            shiftCategory: "ENDO",
            startMinute: 6 * 60,
            endMinute: 14 * 60,
            paidHours: 8,
          },
          {
            shiftCategory: "SATURDAY",
            startMinute: 8 * 60,
            endMinute: 14 * 60,
            paidHours: 6,
          },
        ],
      }),
      {
        total: 2,
        am: 0,
        pm: 0,
        saturday: 2,
        amEarly: 0,
        amRegular: 0,
        pmRegular: 0,
        mondayPmLong: 0,
        saturdayEndoscopy: 1,
        saturdayRegular: 1,
      },
    );
  });

  it("plans safe range unpublishing and a complete month status grid", () => {
    assert.deepEqual(
      planUnpublishScheduleRange({
        startDate: "2026-06-01",
        endDate: "2026-06-03",
        publishedDates: ["2026-06-02"],
      }),
      [
        { date: "2026-06-01", action: "SKIP_NOT_PUBLISHED" },
        { date: "2026-06-02", action: "UNPUBLISH" },
        { date: "2026-06-03", action: "SKIP_NOT_PUBLISHED" },
      ],
    );
    assert.deepEqual(monthCalendarRange("2026-06-15"), {
      monthStartDate: "2026-06-01",
      monthEndDate: "2026-06-30",
      gridStartDate: "2026-06-01",
      gridEndDate: "2026-07-05",
    });
  });

  it("partitions month generation week by week and skips every Sunday", () => {
    const plan = planScheduleGeneration({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      publishedDates: ["2026-07-07"],
    });

    assert.equal(plan.weeks.length, 5);
    assert.equal(plan.generationWeeks.length, 5);
    assert.deepEqual(plan.skippedSundays, [
      "2026-07-05",
      "2026-07-12",
      "2026-07-19",
      "2026-07-26",
    ]);
    assert.deepEqual(plan.publishedDatesSkipped, ["2026-07-07"]);
    assert.equal(plan.schedulableDates.length, 27);
    assert.equal(plan.datesToGenerate.length, 26);
    assert.deepEqual(plan.weeks[0], {
      startDate: "2026-06-29",
      endDate: "2026-07-04",
      dates: [
        "2026-07-01",
        "2026-07-02",
        "2026-07-03",
        "2026-07-04",
      ],
    });
    assert.deepEqual(plan.weeks[4], {
      startDate: "2026-07-27",
      endDate: "2026-08-01",
      dates: [
        "2026-07-27",
        "2026-07-28",
        "2026-07-29",
        "2026-07-30",
        "2026-07-31",
      ],
    });
    assert.deepEqual(
      groupScheduleDatesByClinicWeek([
        "2026-07-11",
        "2026-07-06",
        "2026-07-06",
      ]),
      [
        {
          startDate: "2026-07-06",
          endDate: "2026-07-11",
          dates: ["2026-07-06", "2026-07-11"],
        },
      ],
    );
    assert.deepEqual(
      partialGenerationWeekStarts({
        weeks: plan.weeks,
        publishedDatesSkipped: plan.publishedDatesSkipped,
      }),
      ["2026-07-06"],
    );
  });

  it("keeps the active Easton model in force for Current Easton dates after July", () => {
    assert.equal(isActiveEastonModelDate("2026-06-30"), false);
    assert.equal(isActiveEastonModelDate("2026-07-01"), true);
    assert.equal(isActiveEastonModelDate("2026-08-03"), true);
    assert.equal(isActiveEastonModelDate("2026-08-31"), true);
    assert.equal(
      eastonTargetPatternCodeForDate("2026-08-03"),
      ACTIVE_EASTON_TARGET_PATTERN_CODE,
    );
    assert.equal(
      eastonTargetPatternCodeForDate("2026-08-31"),
      ACTIVE_EASTON_TARGET_PATTERN_CODE,
    );
    assert.equal(julyPatientShiftGroupFromTaskCode("PCP"), "PCP");
  });

  it("derives visible month status from generation, publish, review, and hard rules", () => {
    const base = {
      inMonth: true,
      isSunday: false,
      scheduleStatus: null,
      hasGeneratedContent: false,
      publishIssueCount: 0,
      hardRequirementCount: 0,
      requiredShortageCount: 0,
    };

    assert.deepEqual(getMonthDayPresentation(base), {
      displayStatus: "NOT_GENERATED",
      label: "Not generated",
      tone: "gray",
      needsReview: false,
    });
    assert.equal(
      getMonthDayPresentation({
        ...base,
        scheduleStatus: "GENERATED",
        hasGeneratedContent: true,
      }).displayStatus,
      "GENERATED_DRAFT",
    );
    assert.equal(
      getMonthDayPresentation({
        ...base,
        scheduleStatus: "PUBLISHED",
        hasGeneratedContent: true,
      }).tone,
      "green",
    );
    assert.equal(
      getMonthDayPresentation({
        ...base,
        scheduleStatus: "GENERATED",
        hasGeneratedContent: true,
        publishIssueCount: 1,
      }).displayStatus,
      "NEEDS_REVIEW",
    );
    assert.equal(
      getMonthDayPresentation({
        ...base,
        scheduleStatus: "PUBLISHED",
        hasGeneratedContent: true,
        hardRequirementCount: 2,
      }).displayStatus,
      "HARD_REQUIREMENTS_UNMET",
    );
    assert.equal(
      getMonthDayPresentation({
        ...base,
        isSunday: true,
      }).displayStatus,
      "NOT_SCHEDULED",
    );
    assert.equal(
      getMonthDayPresentation({
        ...base,
        hardRequirementCount: 20,
      }).displayStatus,
      "NOT_GENERATED",
    );
  });
});

describe("resolveDirectReplacement", () => {
  it("selects a compatible replacement when a staffed employee becomes unavailable", () => {
    const result = resolveDirectReplacement({
      seed: "coverage",
      unavailableEmployeeId: "blake",
      slot: slots[1],
      taskType: taskTypes[0],
      employees: baseEmployees,
      existingAssignments: [
        {
          slotId: "front-slot",
          employeeId: "blake",
          taskTypeId: "front-desk",
          date: monday,
          startMinute: 540,
          endMinute: 720,
        },
      ],
    });

    assert.equal(result.conflict, null);
    assert.equal(result.assignment?.employeeId, "alice");
    assert.equal(result.assignment?.source, "COVERAGE_REPLACEMENT");
  });
});

describe("PTO workflow helpers", () => {
  it("expands inclusive date ranges for affected schedule regeneration", () => {
    assert.deepEqual(enumerateIsoDates("2026-06-01", "2026-06-03"), [
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
    ]);
  });

  it("detects partial-day PTO overlap with a schedule slot", () => {
    assert.equal(
      isUnavailableForSlot(
        {
          ...baseEmployees[0],
          unavailable: [
            {
              startDate: monday,
              endDate: monday,
              startMinute: 600,
              endMinute: 660,
            },
          ],
        },
        slots[0],
      ),
      true,
    );
  });

  it("partial PTO blocks only the overlapping shift", () => {
    const result = generateSchedule({
      seed: "partial-pto-shifts",
      employees: [
        {
          id: "partial-pto",
          fullName: "Partial PTO",
          skillIds: [],
          availability: allDayMonday,
          unavailable: [
            {
              startDate: monday,
              endDate: monday,
              startMinute: 480,
              endMinute: 720,
            },
          ],
        },
      ],
      taskTypes,
      slots: [
        {
          id: "am-pto-overlap",
          date: monday,
          taskTypeId: "front-desk",
          slotIndex: 1,
          startMinute: 480,
          endMinute: 720,
        },
        {
          id: "pm-after-pto",
          date: monday,
          taskTypeId: "front-desk",
          slotIndex: 2,
          startMinute: 780,
          endMinute: 1020,
        },
      ],
    });

    assert.deepEqual(
      result.assignments.map((assignment) => assignment.slotId),
      ["pm-after-pto"],
    );
    assert.equal(result.conflicts[0].slotId, "am-pto-overlap");
  });

  it("requires manager approval for every PTO request type", () => {
    assert.equal(isAutoApprovedPtoType("SICK"), false);
    assert.equal(isAutoApprovedPtoType("EMERGENCY"), false);
    assert.equal(requiresManagerApproval("SICK"), true);
    assert.equal(requiresManagerApproval("EMERGENCY"), true);
  });

  it("keeps personal and vacation requests on the approval path", () => {
    assert.equal(requiresManagerApproval("PERSONAL"), true);
    assert.equal(requiresManagerApproval("VACATION"), true);
    assert.equal(deductsPtoBalance("PERSONAL"), true);
    assert.equal(calculatePtoHours({ startDate: monday, endDate: monday }), 8);
  });

  it("denies balance-deducting PTO approval below the negative limit", () => {
    assert.equal(
      wouldPutPtoBalanceBelowFloor({
        currentBalanceHours: -20,
        requestHours: 8,
      }),
      true,
    );
    assert.equal(
      wouldPutPtoBalanceBelowFloor({
        currentBalanceHours: -16,
        requestHours: 8,
      }),
      false,
    );
  });

  it("detects PTO submitted within seven days of an affected date", () => {
    assert.equal(
      isShortNoticeForDateRange({
        createdAt: "2026-05-25",
        startDate: "2026-06-01",
        endDate: "2026-06-03",
      }),
      true,
    );
    assert.equal(
      isShortNoticeForDateRange({
        createdAt: "2026-05-24",
        startDate: "2026-06-01",
        endDate: "2026-06-03",
      }),
      false,
    );
  });

  it("detects short-notice schedule changes within seven days of a shift", () => {
    assert.equal(
      isShortNoticeScheduleChange({
        changedAt: "2026-05-25",
        shiftDate: "2026-06-01",
      }),
      true,
    );
    assert.equal(
      isShortNoticeScheduleChange({
        changedAt: "2026-05-24",
        shiftDate: "2026-06-01",
      }),
      false,
    );
  });
});

describe("NPTO workflow helpers", () => {
  it("approved NPTO prevents scheduling", () => {
    const result = generateSchedule({
      seed: "approved-npto-blocks",
      employees: [
        {
          id: "npto-employee",
          fullName: "NPTO Employee",
          skillIds: [],
          availability: allDayMonday,
          unavailable: [{ startDate: monday, endDate: monday }],
        },
      ],
      taskTypes,
      slots: [slots[1]],
    });

    assert.equal(result.assignments.length, 0);
    assert.equal(result.conflicts.length, 1);
    assert.equal(
      result.conflicts[0].rejectedCandidates[0].reasons.includes(
        "PTO or approved unavailability",
      ),
      true,
    );
  });

  it("does not reduce PTO balance", () => {
    assert.equal(nptoDeductsPtoBalance(), false);
    assert.equal(calculateNptoHours({ startDate: monday, endDate: monday }), 8);
  });

  it("ignores the legacy NPTO cap policy", () => {
    assert.equal(
      wouldExceedNptoCap({
        usedHours: 236,
        requestHours: 8,
        capHours: 240,
      }),
      false,
    );
  });

  it("keeps overridden NPTO schedule-blocking without cap validation", () => {
    assert.equal(
      wouldExceedNptoCap({
        usedHours: 240,
        requestHours: 8,
        capHours: 240,
      }),
      false,
    );
    assert.equal(isScheduleBlockingNptoStatus("OVERRIDDEN"), true);
  });

  it("restores availability when NPTO is reversed", () => {
    const blocked = generateSchedule({
      seed: "npto-before-reversal",
      employees: [
        {
          id: "npto-after-reversal",
          fullName: "NPTO After Reversal",
          skillIds: [],
          availability: allDayMonday,
          unavailable: [{ startDate: monday, endDate: monday }],
        },
      ],
      taskTypes,
      slots: [slots[1]],
    });
    const restored = generateSchedule({
      seed: "npto-after-reversal",
      employees: [
        {
          id: "npto-after-reversal",
          fullName: "NPTO After Reversal",
          skillIds: [],
          availability: allDayMonday,
          unavailable: [],
        },
      ],
      taskTypes,
      slots: [slots[1]],
    });

    assert.equal(blocked.assignments.length, 0);
    assert.equal(restored.assignments[0].employeeId, "npto-after-reversal");
  });

  it("preserves locked manual overrides while NPTO creates conflict visibility", () => {
    const result = generateSchedule({
      seed: "npto-locked-override",
      employees: [
        {
          id: "locked-npto",
          fullName: "Locked NPTO",
          skillIds: [],
          availability: allDayMonday,
          unavailable: [{ startDate: monday, endDate: monday }],
        },
      ],
      taskTypes,
      slots: [
        {
          ...slots[1],
          lockedEmployeeIds: ["locked-npto"],
        },
      ],
    });

    assert.deepEqual(
      result.assignments.map((assignment) => [
        assignment.employeeId,
        assignment.source,
      ]),
      [["locked-npto", "LOCKED"]],
    );
    assert.equal(result.conflicts.length, 0);
  });

  it("uses the existing short-notice window for NPTO requests", () => {
    assert.equal(
      isShortNoticeForDateRange({
        createdAt: "2026-05-25",
        startDate: "2026-06-01",
        endDate: "2026-06-01",
      }),
      true,
    );
  });
});

describe("clinic scenarios", () => {
  const scenarioTaskTypes = [
    {
      id: "front-desk",
      optional: false,
      defaultForRoutine: true,
      defaultForReduced: true,
    },
    {
      id: "procedures",
      optional: false,
      defaultForRoutine: true,
      defaultForReduced: false,
    },
    {
      id: "research",
      optional: true,
      defaultForRoutine: false,
      defaultForReduced: false,
    },
  ];

  it("creates no default slots for clinic closed days", () => {
    assert.deepEqual(
      selectDefaultTaskTypesForScenario("CLINIC_CLOSED", scenarioTaskTypes),
      [],
    );
  });

  it("only includes optional tasks when manually added", () => {
    const routineDefaults = selectDefaultTaskTypesForScenario(
      "ROUTINE",
      scenarioTaskTypes,
    );

    assert.deepEqual(
      routineDefaults.map((taskType) => taskType.id),
      ["front-desk", "procedures"],
    );
    assert.equal(routineDefaults.some((taskType) => taskType.id === "research"), false);

    const manuallyAddedTaskIds = [...routineDefaults.map((taskType) => taskType.id)];
    manuallyAddedTaskIds.push("research");

    assert.equal(manuallyAddedTaskIds.includes("research"), true);
  });
});

describe("staffing requirement rules", () => {
  const staffingTaskTypes = [
    {
      id: "allergy-shots",
      name: "Allergy Shots",
      optional: false,
      defaultForRoutine: true,
      defaultForReduced: true,
      sortOrder: 10,
    },
    {
      id: "procedures",
      name: "Procedure",
      optional: false,
      defaultForRoutine: true,
      defaultForReduced: false,
      sortOrder: 20,
    },
    {
      id: "research",
      name: "Research",
      optional: true,
      defaultForRoutine: false,
      defaultForReduced: false,
      sortOrder: 30,
    },
  ];

  it("turns shift templates into concrete shift block snapshots", () => {
    const snapshot = buildShiftBlockSnapshot({
      id: "am-early-template",
      name: "AM early",
      startMinute: 7 * 60,
      endMinute: 12 * 60,
      paidHours: 5,
      shiftCategory: "AM",
      defaultForSchedule: false,
      notes: "Spreadsheet default",
    });

    assert.deepEqual(snapshot, {
      shiftTemplateId: "am-early-template",
      name: "AM early",
      startMinute: 420,
      endMinute: 720,
      paidHours: 5,
      shiftCategory: "AM",
      defaultForSchedule: false,
      source: "TEMPLATE",
      active: true,
      notes: "Spreadsheet default",
    });
  });

  it("creates multiple slots for one task type from staffing rules", () => {
    const specs = selectStaffingSlotSpecs({
      date: saturday,
      scenario: "ROUTINE",
      taskTypes: staffingTaskTypes,
      shiftBlocks: [saturdayShiftBlock],
      rules: [
        {
          id: "sat-allergy",
          taskTypeId: "allergy-shots",
          weekday: 6,
          scenario: "ROUTINE",
          minRequiredSlots: 2,
          desiredSlots: 2,
          maxSlots: 2,
          requirementLevel: "DESIRED",
          active: true,
        },
      ],
    });

    assert.deepEqual(
      specs
        .filter((spec) => spec.taskTypeId === "allergy-shots")
        .map((spec) => [spec.slotIndex, spec.requirementLevel]),
      [
        [1, "REQUIRED"],
        [2, "REQUIRED"],
      ],
    );
  });

  it("creates task slots for a specific configured shift block", () => {
    const specs = selectStaffingSlotSpecs({
      date: monday,
      scenario: "ROUTINE",
      taskTypes: staffingTaskTypes,
      shiftBlocks: [defaultShiftBlock, pmShiftBlock],
      rules: [
        {
          id: "pm-procedure",
          taskTypeId: "procedures",
          shiftTemplateId: "pm-regular-template",
          shiftCategory: null,
          weekday: 1,
          scenario: "ROUTINE",
          minRequiredSlots: 1,
          desiredSlots: 1,
          maxSlots: 1,
          requirementLevel: "REQUIRED",
          active: true,
        },
      ],
    });

    assert.deepEqual(
      specs
        .filter((spec) => spec.staffingRequirementRuleId === "pm-procedure")
        .map((spec) => [spec.shiftBlockId, spec.slotIndex, spec.requirementLevel]),
      [
        ["pm-regular-block", 1, "REQUIRED"],
      ],
    );
  });

  it("does not put safe defaults onto non-default shift blocks", () => {
    const specs = selectStaffingSlotSpecs({
      date: monday,
      scenario: "ROUTINE",
      taskTypes: staffingTaskTypes,
      shiftBlocks: [defaultShiftBlock, pmShiftBlock],
      rules: [],
    });

    assert.equal(
      specs.some((spec) => spec.shiftBlockId === "pm-regular-block"),
      false,
    );
    assert.equal(
      specs.filter((spec) => spec.shiftBlockId === "am-regular-block").length,
      2,
    );
  });

  it("chooses the regular 0800 shift as a safe default when none is configured", () => {
    const unconfiguredBlocks = [
      { ...defaultShiftBlock, id: "early", startMinute: 420, defaultForSchedule: false },
      { ...defaultShiftBlock, id: "regular", defaultForSchedule: false },
      { ...pmShiftBlock, defaultForSchedule: false },
    ];
    const specs = selectStaffingSlotSpecs({
      date: monday,
      scenario: "ROUTINE",
      taskTypes: staffingTaskTypes,
      shiftBlocks: unconfiguredBlocks,
      rules: [],
    });

    assert.equal(selectSafeDefaultShiftBlockId(unconfiguredBlocks), "regular");
    assert.equal(specs.length, 2);
    assert.equal(specs.every((spec) => spec.shiftBlockId === "regular"), true);
  });

  it("varies staffing rules by day of week", () => {
    const rules = [
      {
        id: "sat-allergy",
        taskTypeId: "allergy-shots",
        weekday: 6,
        scenario: "ROUTINE" as const,
        minRequiredSlots: 2,
        desiredSlots: 2,
        maxSlots: 2,
        requirementLevel: "DESIRED" as const,
        active: true,
      },
    ];

    assert.equal(
      selectStaffingSlotSpecs({
        date: monday,
        scenario: "ROUTINE",
        taskTypes: staffingTaskTypes,
        shiftBlocks: [defaultShiftBlock],
        rules,
      }).filter((spec) => spec.taskTypeId === "allergy-shots").length,
      1,
    );
    assert.equal(
      selectStaffingSlotSpecs({
        date: saturday,
        scenario: "ROUTINE",
        taskTypes: staffingTaskTypes,
        shiftBlocks: [saturdayShiftBlock],
        rules,
      }).filter((spec) => spec.taskTypeId === "allergy-shots").length,
      2,
    );
  });

  it("varies staffing rules by scenario", () => {
    const rules = [
      {
        id: "reduced-procedure-removal",
        taskTypeId: "procedures",
        weekday: null,
        scenario: "DOCTOR_OFF_REDUCED_STAFFING" as const,
        minRequiredSlots: 0,
        desiredSlots: 0,
        maxSlots: 1,
        requirementLevel: "CONDITIONAL" as const,
        active: true,
      },
    ];

    assert.equal(
      selectStaffingSlotSpecs({
      date: monday,
      scenario: "ROUTINE",
      taskTypes: staffingTaskTypes,
      shiftBlocks: [defaultShiftBlock],
      rules,
      }).some((spec) => spec.taskTypeId === "procedures"),
      true,
    );
    assert.equal(
      selectStaffingSlotSpecs({
      date: monday,
      scenario: "DOCTOR_OFF_REDUCED_STAFFING",
      taskTypes: staffingTaskTypes,
      shiftBlocks: [defaultShiftBlock],
      rules,
      }).some((spec) => spec.taskTypeId === "procedures"),
      false,
    );
  });

  it("lets future schedule preparation change when a rule changes", () => {
    const baseRule = {
      id: "allergy-volume",
      taskTypeId: "allergy-shots",
      weekday: 6,
      scenario: "ROUTINE" as const,
      minRequiredSlots: 1,
      desiredSlots: 2,
      maxSlots: 3,
      requirementLevel: "DESIRED" as const,
      active: true,
    };
    const before = selectStaffingSlotSpecs({
      date: saturday,
      scenario: "ROUTINE",
      taskTypes: staffingTaskTypes,
      shiftBlocks: [saturdayShiftBlock],
      rules: [baseRule],
    });
    const after = selectStaffingSlotSpecs({
      date: saturday,
      scenario: "ROUTINE",
      taskTypes: staffingTaskTypes,
      shiftBlocks: [saturdayShiftBlock],
      rules: [{ ...baseRule, desiredSlots: 3 }],
    });

    assert.equal(
      before.filter((spec) => spec.taskTypeId === "allergy-shots").length,
      2,
    );
    assert.equal(
      after.filter((spec) => spec.taskTypeId === "allergy-shots").length,
      3,
    );
  });

  it("only includes optional tasks when manually added or rule-configured", () => {
    const defaults = selectStaffingSlotSpecs({
      date: monday,
      scenario: "ROUTINE",
      taskTypes: staffingTaskTypes,
      shiftBlocks: [defaultShiftBlock],
      rules: [],
    });
    const withRule = selectStaffingSlotSpecs({
      date: monday,
      scenario: "ROUTINE",
      taskTypes: staffingTaskTypes,
      shiftBlocks: [defaultShiftBlock],
      rules: [
        {
          id: "research-rule",
          taskTypeId: "research",
          weekday: null,
          scenario: "ROUTINE",
          minRequiredSlots: 0,
          desiredSlots: 1,
          maxSlots: 1,
          requirementLevel: "OPTIONAL",
          active: true,
        },
      ],
    });

    assert.equal(defaults.some((spec) => spec.taskTypeId === "research"), false);
    assert.equal(withRule.some((spec) => spec.taskTypeId === "research"), true);
  });

  it("creates no default slots for clinic closed days", () => {
    assert.deepEqual(
      selectStaffingSlotSpecs({
        date: monday,
        scenario: "CLINIC_CLOSED",
        taskTypes: staffingTaskTypes,
        shiftBlocks: [defaultShiftBlock],
        rules: [
          {
            id: "global-allergy",
            taskTypeId: "allergy-shots",
            weekday: null,
            scenario: null,
            minRequiredSlots: 2,
            desiredSlots: 2,
            maxSlots: 2,
            requirementLevel: "REQUIRED",
            active: true,
          },
        ],
      }),
      [],
    );
  });
});

describe("Easton policy helpers", () => {
  it("orders shortage recommendations by configured Easton closure priority", () => {
    const recommendations = selectShortageRecommendations({
      scenario: "ROUTINE",
      slot: {
        taskTypeId: "civil",
        shiftBlock: {
          shiftTemplateId: null,
          shiftCategory: "AM",
        },
      },
      rules: [
        {
          taskTypeId: "civil",
          shiftTemplateId: null,
          shiftCategory: null,
          scenario: null,
          closurePriority: 7,
          managerInstruction: "Civil last",
        },
        {
          taskTypeId: "float",
          shiftTemplateId: null,
          shiftCategory: null,
          scenario: null,
          closurePriority: 1,
          managerInstruction: "Pull Float first",
        },
        {
          taskTypeId: "booking",
          shiftTemplateId: null,
          shiftCategory: null,
          scenario: null,
          closurePriority: 3,
          managerInstruction: "Pull Booking third",
        },
      ],
    });

    assert.deepEqual(recommendations, [
      "1. Pull Float first",
      "2. Pull Booking third",
      "3. Civil last",
    ]);
  });

  it("selects background pull candidates by rank and respects pull caps", () => {
    const candidates = selectBackgroundPullCandidates({
      assignments: [
        {
          assignmentId: "yvonne-bg",
          employeeId: "yvonne",
          taskTypeCode: "BACKGROUND",
          canBePulledForClinic: true,
        },
        {
          assignmentId: "katie-bg",
          employeeId: "katie",
          taskTypeCode: "BACKGROUND",
          canBePulledForClinic: true,
        },
        {
          assignmentId: "protected",
          employeeId: "hanna",
          taskTypeCode: "BACKGROUND",
          canBePulledForClinic: true,
          protectedFromPull: true,
        },
      ],
      rules: [
        { employeeId: "katie", priorityRank: 2, maxPullsPerPeriod: 1 },
        { employeeId: "yvonne", priorityRank: 1, maxPullsPerPeriod: null },
        { employeeId: "hanna", priorityRank: 3, maxPullsPerPeriod: 1 },
      ],
      pullCountsByEmployee: { katie: 1 },
    });

    assert.deepEqual(
      candidates.map((candidate) => candidate.assignmentId),
      ["yvonne-bg"],
    );
  });

  it("parses the Easton workbook shape and final 0700-1200 shift times", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "easton-"));
    const workbookPath = path.join(directory, "easton.xlsx");
    const workbook = new ExcelJS.Workbook();
    const shifts = workbook.addWorksheet("Shifts + Hours");

    shifts.getRow(1).values = ["", "Monday (1)", "", "Saturday (1)", ""];
    shifts.getRow(2).values = [
      "",
      "0700~1200 (5)",
      "1300~1700 (4)",
      "0600~1400 (8)",
      "0800~1400 (6)",
    ];
    shifts.getRow(3).values = ["Shift Hours", 5, 4, 8, 6];
    shifts.getRow(4).values = ["GI", 1, 2, 0, 1];
    shifts.getRow(5).values = ["PCP", 1, 0, 0, 2];
    shifts.getRow(6).values = ["BG", 0, 3, 0, 1];
    shifts.getRow(7).values = ["Patients", 2, 2, 0, 3];
    shifts.getRow(8).values = ["Allergy Shots", 1, 1, 0, 1];

    const targets = workbook.addWorksheet("NEW NEW Shifts by GY");
    targets.getRow(1).values = [
      "",
      "",
      "Gap year",
      "Role",
      "Group",
      "GI (1)",
      "ALLERGY (1)",
      "PCP (1)",
      "Patients (3)",
      "FRONT (1)",
      "ENDO (8)",
      "BG",
    ];
    targets.getRow(2).values = [
      1,
      "FRONT _ ENDO",
      "Yvonne",
      "PCP",
      "T + Th",
      1,
      1,
      1,
      3,
      0,
      0,
      2,
    ];
    const endoNames = [
      "Angela",
      "Easton",
      "Gisella",
      "Giulia",
      "Josh",
      "Maryn",
      "Nicole",
      "Rowan",
    ];

    endoNames.forEach((name, index) => {
      targets.getRow(index + 3).values = [
        index + 2,
        "Endo",
        name,
        "Endo",
        "Saturday",
        name === "Easton" ? 1 : 0,
        name === "Easton" ? 1 : 0,
        0,
        name === "Easton" ? 2 : 0,
        name === "Easton" ? 1 : 0,
        1,
        name === "Easton" ? 5 : name === "Giulia" ? 3 : 0,
      ];
    });
    targets.getRow(11).values = [10, "Special", "Krishi", "IT"];
    targets.getRow(12).values = [11, "Special", "Ibrahim", "Research"];

    const legacyTargets = workbook.addWorksheet("Shifts by GY");
    legacyTargets.getRow(1).values = [
      "",
      "",
      "Gap year",
      "Role",
      "Group",
      "GI (1)",
      "BG",
    ];
    legacyTargets.getRow(2).values = [
      1,
      "Legacy",
      "Legacy Person",
      "PCP",
      "M + W",
      1,
      9,
    ];

    const june = workbook.addWorksheet("June Schedule");
    june.getRow(1).values = ["", "", "Monday"];
    june.getRow(2).values = ["", "", "0700~1200 (5)"];
    june.getRow(3).values = [1, "Yvonne", "NEW GI"];

    await workbook.xlsx.writeFile(workbookPath);

    const preview = await parseEastonWorkbook(workbookPath);

    assert.equal(preview.activeEmployeeTargetSheetName, "NEW NEW Shifts by GY");
    assert.equal(preview.shifts[0].startMinute, 7 * 60);
    assert.equal(preview.shifts[0].endMinute, 12 * 60);
    assert.equal(preview.shifts[0].paidHours, 5);
    assert.equal(preview.roleDemand[0].roleCode, "NEW_GI");
    assert.equal(
      preview.roleDemand.some((demand) => demand.roleCode === "PCP"),
      true,
    );
    assert.equal(
      preview.shifts.some(
        (shift) =>
          shift.weekday === 1 &&
          shift.startMinute === 13 * 60 &&
          shift.endMinute === 17 * 60,
      ),
      true,
    );
    assert.equal(
      preview.shifts.filter((shift) => shift.weekday === 6).length,
      2,
    );
    assert.equal(
      preview.roleDemand.some(
        (demand) =>
          demand.roleCode === "BACKGROUND" &&
          demand.startMinute === 13 * 60 &&
          demand.count === 3,
      ),
      true,
    );
    assert.equal(preview.employeeTargets[0].employeeName, "Yvonne");
    assert.equal(preview.employeeTargets[0].skillLabel, "FRONT _ ENDO");
    assert.deepEqual(preview.employeeTargets[0].importedSkillCodes, ["FRONT"]);
    assert.equal(preview.employeeTargets[0].activeTargetSheetName, "NEW NEW Shifts by GY");
    assert.equal(preview.employeeTargets[0].scheduleEligibility, "ACTIVE_SCHEDULED");
    assert.equal(preview.employeeTargets[0].workPatternCode, "EASTON_GROUP_T_TH");
    assert.deepEqual(preview.employeeTargets[0].extraHourWeekdays, [2, 4]);
    assert.equal(preview.employeeTargets[0].requiredBackgroundAssignments, 2);
    assert.equal(preview.employeeTargets[0].targetTotalHours, 40);
    assert.equal(
      preview.employeeTargets.some((target) => target.employeeName === "Legacy Person"),
      false,
    );
    assert.equal(
      preview.employeeTargets.filter(
        (target) =>
          target.scheduleEligibility === "ACTIVE_SCHEDULED" &&
          Number(target.targetTaskCounts.ENDOSCOPY ?? 0) > 0,
      ).length,
      8,
    );
    assert.equal(
      preview.employeeTargets.find((target) => target.employeeName === "Krishi")
        ?.scheduleEligibility,
      "SPECIAL_EXCLUDED",
    );
    assert.equal(
      preview.employeeTargets.find((target) => target.employeeName === "Ibrahim")
        ?.scheduleEligibility,
      "SPECIAL_EXCLUDED",
    );
    assert.equal(
      preview.employeeTargets.find((target) => target.employeeName === "Easton")
        ?.requiredBackgroundAssignments,
      5,
    );
    assert.equal(
      preview.employeeTargets.find((target) => target.employeeName === "Giulia")
        ?.requiredBackgroundAssignments,
      3,
    );
    assert.equal(
      preview.roleDemand
        .filter((demand) => demand.roleCode === "PATIENTS")
        .every((demand) => demand.aggregate),
      true,
    );
    assert.equal(
      preview.roleDemand
        .filter((demand) => !demand.aggregate)
        .some((demand) => demand.roleCode === "PATIENTS"),
      false,
    );
    assert.equal(
      preview.roleDemand.some((demand) => demand.roleCode === "ALLERGY_SHOTS"),
      false,
    );
    assert.equal(
      preview.warnings.some((warning) =>
        warning.includes("Allergy Shots is deprecated for Current Easton generation"),
      ),
      true,
    );
    assert.equal(preview.sampleAssignments.length, 0);
  });

  it("parses FRONT from Easton skill indicator labels", () => {
    assert.deepEqual(parseEastonSkillCodes("FRONT"), ["FRONT"]);
    assert.deepEqual(parseEastonSkillCodes("FRONT + ENDO"), ["FRONT"]);
    assert.deepEqual(parseEastonSkillCodes("FRONT _ ENDO"), ["FRONT"]);
    assert.deepEqual(parseEastonSkillCodes("IT + FRONT"), ["FRONT"]);
    assert.deepEqual(parseEastonSkillCodes("FRONT BG"), ["FRONT"]);
    assert.deepEqual(parseEastonSkillCodes("FRONT_ENDO"), ["FRONT"]);
    assert.deepEqual(parseEastonSkillCodes("ENDO"), []);
  });

  it("uses the latest workbook targets and demand totals when available", async () => {
    const workbookPath = path.join(
      process.cwd(),
      "private",
      "Easton Scheduling 6-16.xlsx",
    );

    try {
      await fs.access(workbookPath);
    } catch {
      return;
    }

    const preview = await parseEastonWorkbook(workbookPath);
    const totalGeneratedDemand = preview.roleDemand
      .filter((demand) => !demand.aggregate)
      .reduce((total, demand) => total + demand.count, 0);
    const targetByName = new Map(
      preview.employeeTargets.map((target) => [target.employeeName, target]),
    );

    assert.equal(preview.activeEmployeeTargetSheetName, "NEW NEW Shifts by GY");
    assert.equal(totalGeneratedDemand, 198);
    assert.equal(targetByName.get("Angela")?.requiredBackgroundAssignments, 2);
    assert.deepEqual(targetByName.get("Angela")?.importedSkillCodes, ["FRONT"]);
    assert.equal(targetByName.get("Giulia")?.requiredBackgroundAssignments, 3);
    assert.equal(targetByName.get("Nicole")?.requiredBackgroundAssignments, 3);
    assert.equal(
      preview.employeeTargets
        .filter((target) => target.scheduleEligibility === "ACTIVE_SCHEDULED")
        .filter((target) => Number(target.targetTaskCounts.ENDOSCOPY ?? 0) > 0)
        .length,
      8,
    );
    assert.equal(
      preview.roleDemand
        .filter((demand) => !demand.aggregate)
        .some((demand) => demand.roleCode === "PATIENTS"),
      false,
    );
  });
});

describe("Current Easton hard requirements", () => {
  type TestTopOffTaskType = {
    id: string;
    code: string;
    name: string;
    requiredSkillIds: string[];
    isBackground: boolean;
    isPatientFacing: boolean;
    isClinical: boolean;
    isSkilled: boolean;
    isEndoscopy: boolean;
    isFloat: boolean;
  };

  type TestTopOffAssignment = {
    id: string;
    employeeId: string;
    locked: boolean;
    source: string;
  };

  type TestTopOffSlot = {
    id: string;
    date: string;
    scheduleDayId: string;
    shiftBlockId: string;
    shiftCategory: string;
    shiftName: string;
    paidHours: number;
    taskTypeId: string;
    slotIndex: number;
    requirementLevel: string;
    startMinute: number;
    endMinute: number;
    minStaff: number;
    requiredStaff: number;
    requiredSkillIds: string[];
    eligibleEmployeeIds: string[];
    taskType: TestTopOffTaskType;
    source: string;
    currentAssignmentCount: number;
    assignments: TestTopOffAssignment[];
  };

  type TestExistingAssignment = {
    slotId: string;
    employeeId: string;
    date: string;
    taskTypeId: string;
    shiftBlockId: string;
    shiftCategory: string;
    startMinute: number;
    endMinute: number;
    paidHours: number;
    isPatientFacing?: boolean;
    isClinical?: boolean;
    isBackground?: boolean;
    isEndoscopy?: boolean;
    locked: boolean;
  };

  type TestTopOffState = {
    hours: number;
    backgroundAssignments: number;
    shiftKeys: Set<string>;
  };

  function topOffEmployee(input: {
    id: string;
    fullName: string;
    required: number;
    assignedBg: number;
    skillIds?: string[];
  }) {
    return {
      id: input.id,
      fullName: input.fullName,
      active: true,
      skillIds: input.skillIds ?? ["clinic"],
      availability: [1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        startMinute: 0,
        endMinute: 24 * 60,
      })),
      unavailable: [],
      expectedHours: 40,
      targetWeeklyHours: 40,
      requiredBackgroundAssignments: input.required,
      targetTaskCounts: { BACKGROUND: input.required },
      workPattern: null,
      assignedBg: input.assignedBg,
    };
  }

  function bgTaskType(): TestTopOffTaskType {
    return {
      id: "background",
      code: "BACKGROUND",
      name: "Background",
      requiredSkillIds: [],
      isBackground: true,
      isPatientFacing: false,
      isClinical: false,
      isSkilled: false,
      isEndoscopy: false,
      isFloat: false,
    };
  }

  function topOffSlot(input: {
    id: string;
    date: string;
    shiftBlockId: string;
    shiftName: string;
    taskType: TestTopOffTaskType;
    requirementLevel: string;
    requiredStaff?: number;
  }): TestTopOffSlot {
    return {
      id: input.id,
      date: input.date,
      scheduleDayId: `${input.id}-day`,
      shiftBlockId: input.shiftBlockId,
      shiftCategory: "AM",
      shiftName: input.shiftName,
      paidHours: 4,
      taskTypeId: String(input.taskType.id),
      slotIndex: 1,
      requirementLevel: input.requirementLevel,
      startMinute: 8 * 60,
      endMinute: 12 * 60,
      minStaff: input.requiredStaff ?? 0,
      requiredStaff: input.requiredStaff ?? 1,
      requiredSkillIds: [],
      eligibleEmployeeIds: [],
      taskType: input.taskType,
      source: "STAFFING_RULE",
      currentAssignmentCount: 0,
      assignments: [],
    };
  }

  function topOffAssignment(employeeId: string, id: string): TestTopOffAssignment {
    return { id, employeeId, locked: false, source: "GENERATED" };
  }

  function existingFromTopOffSlot(
    slot: TestTopOffSlot,
    employeeId: string,
  ): TestExistingAssignment {
    return {
      slotId: slot.id,
      employeeId,
      date: slot.date,
      taskTypeId: slot.taskTypeId,
      startMinute: slot.startMinute,
      endMinute: slot.endMinute,
      shiftBlockId: slot.shiftBlockId,
      shiftCategory: slot.shiftCategory,
      paidHours: slot.paidHours,
      isPatientFacing: slot.taskType.isPatientFacing,
      isClinical: slot.taskType.isClinical,
      isBackground: slot.taskType.isBackground,
      isEndoscopy: slot.taskType.isEndoscopy,
      locked: false,
    };
  }

  function fillerAssignments(
    employeeId: string,
    prefix: string,
    hours: number,
  ): TestExistingAssignment[] {
    return Array.from({ length: hours / 4 }, (_, index) => ({
      slotId: `${prefix}-filler-${index}`,
      employeeId,
      date: `2026-07-${String(20 + index).padStart(2, "0")}`,
      taskTypeId: "filler",
      shiftBlockId: `${prefix}-filler-block-${index}`,
      shiftCategory: "PM",
      startMinute: 13 * 60,
      endMinute: 17 * 60,
      paidHours: 4,
      isBackground: false,
      locked: false,
    }));
  }

  it("matches first-name Easton targets to unique active full-name employees", () => {
    const employees = [
      { id: "alice-id", fullName: "Alice Huang" },
      { id: "carol-id", fullName: "Carol Ge" },
    ];
    const targets = [
      { employeeId: null, employeeName: "Alice" },
      { employeeId: null, employeeName: "Carol" },
    ];

    assert.equal(
      findEastonTargetForEmployee(employees[0], targets)?.employeeName,
      "Alice",
    );
    assert.equal(findEmployeeForEastonTarget(targets[1], employees)?.id, "carol-id");
  });

  it("does not guess ambiguous first-name Easton target matches", () => {
    const employees = [
      { id: "alice-h", fullName: "Alice Huang" },
      { id: "alice-l", fullName: "Alice Lee" },
    ];
    const target = { employeeId: null, employeeName: "Alice" };

    assert.equal(findEmployeeForEastonTarget(target, employees), null);
  });

  it("does not match special excluded Easton targets to employees", () => {
    const employees = [{ id: "krishi", fullName: "Krishi Patel" }];
    const targets = [
      {
        employeeId: null,
        employeeName: "Krishi",
        scheduleEligibility: "SPECIAL_EXCLUDED",
      },
    ];

    assert.equal(findEastonTargetForEmployee(employees[0], targets), null);
    assert.equal(findEmployeeForEastonTarget(targets[0], employees), null);
  });

  it("uses exact Current Easton target groups ahead of old generic Easton work patterns", () => {
    const workPattern = getEffectiveWorkPattern({
      employeeWorkPattern: {
        code: "EASTON_NON_ENDOSCOPY_SATURDAY",
        kind: "NON_ENDOSCOPY_SATURDAY",
        targetWeeklyHours: 40,
        saturdayPaidHours: 6,
        requiredSaturdayShiftCategory: "SATURDAY",
        extraHourWeekdays: [],
      },
      scheduleTarget: {
        workPatternCode: "EASTON_GROUP_T_TH",
        extraHourWeekdays: [2, 4],
        targetTotalHours: 40,
        requiredBackgroundAssignments: 2,
      },
      expectedWeeklyHours: 40,
    });

    assert.equal(workPattern?.kind, "NON_ENDOSCOPY_SATURDAY");
    assert.deepEqual(workPattern?.extraHourWeekdays, [2, 4]);
    assert.equal(workPattern?.saturdayPaidHours, 6);
  });

  it("derives broad July clinic availability for non-endoscopy employees", () => {
    const employee = withEastonDerivedAvailability({
      id: "alice",
      fullName: "Alice Huang",
      skillIds: [],
      availability: [
        { weekday: 2, startMinute: 480, endMinute: 1020 },
        { weekday: 4, startMinute: 480, endMinute: 1020 },
      ],
      workPattern: {
        kind: "NON_ENDOSCOPY_SATURDAY",
        requiredSaturdayShiftCategory: "SATURDAY",
        saturdayPaidHours: 6,
        extraHourWeekdays: [2, 4],
      },
    });

    assert.equal(
      employee.availability.some(
        (window) =>
          window.weekday === 1 &&
          window.startMinute === 420 &&
          window.endMinute === 1080,
      ),
      true,
    );
    assert.equal(
      employee.availability.some(
        (window) =>
          window.weekday === 6 &&
          window.startMinute === 360 &&
          window.endMinute === 840,
      ),
      true,
    );
  });

  it("derives July availability that covers Monday early and long PM", () => {
    const windows = eastonDerivedAvailabilityWindows({
      workPattern: {
        kind: "NON_ENDOSCOPY_SATURDAY",
        requiredSaturdayShiftCategory: "SATURDAY",
        saturdayPaidHours: 6,
        extraHourWeekdays: [1, 3],
      },
    });

    assert.equal(
      windows.some(
        (window) =>
          window.weekday === 1 &&
          window.startMinute === 420 &&
          window.endMinute === 1080,
      ),
      true,
    );
    assert.equal(
      windows.some(
        (window) =>
          window.weekday === 6 &&
          window.startMinute === 360 &&
          window.endMinute === 840,
      ),
      true,
    );
  });

  it("assigns T + Th 0700-1200 even when base availability is 0800-1700", () => {
    const taskType = {
      id: "background",
      code: "BACKGROUND",
      name: "Background",
      requiredSkillIds: [],
      isBackground: true,
    };
    const result = generateSchedule({
      seed: "derived-availability-t-th",
      employees: [
        withEastonDerivedAvailability({
          id: "alice",
          fullName: "Alice Huang",
          skillIds: [],
          availability: [
            { weekday: 2, startMinute: 480, endMinute: 1020 },
            { weekday: 4, startMinute: 480, endMinute: 1020 },
          ],
          workPattern: {
            kind: "NON_ENDOSCOPY_SATURDAY",
            requiredSaturdayShiftCategory: "SATURDAY",
            saturdayPaidHours: 6,
            extraHourWeekdays: [2, 4],
          },
        }),
      ],
      taskTypes: [taskType],
      slots: [
        {
          id: "tue-early",
          date: "2026-07-07",
          taskTypeId: "background",
          slotIndex: 1,
          startMinute: 420,
          endMinute: 720,
          paidHours: 5,
          requirementLevel: "REQUIRED",
        },
        {
          id: "thu-early",
          date: "2026-07-09",
          taskTypeId: "background",
          slotIndex: 1,
          startMinute: 420,
          endMinute: 720,
          paidHours: 5,
          requirementLevel: "REQUIRED",
        },
      ],
    });

    assert.deepEqual(
      result.assignments.map((assignment) => assignment.slotId).sort(),
      ["thu-early", "tue-early"],
    );
  });

  it("assigns Saturday/endoscopy 0600-1400 even when base availability is 0800-1700", () => {
    const result = generateSchedule({
      seed: "derived-availability-endo-saturday",
      employees: [
        withEastonDerivedAvailability({
          id: "endo",
          fullName: "Endoscopy Worker",
          skillIds: [],
          availability: [{ weekday: 6, startMinute: 480, endMinute: 1020 }],
          workPattern: {
            kind: "ENDOSCOPY_SATURDAY",
            requiredSaturdayShiftCategory: "ENDO",
            saturdayPaidHours: 8,
            extraHourWeekdays: [],
          },
        }),
      ],
      taskTypes: [
        {
          id: "endoscopy",
          code: "ENDOSCOPY",
          name: "Endoscopy",
          requiredSkillIds: [],
          isPatientFacing: true,
          isClinical: true,
          isEndoscopy: true,
        },
      ],
      slots: [
        {
          id: "sat-endo",
          date: "2026-07-11",
          taskTypeId: "endoscopy",
          slotIndex: 1,
          startMinute: 360,
          endMinute: 840,
          paidHours: 8,
          shiftCategory: "ENDO",
          requirementLevel: "REQUIRED",
        },
      ],
    });

    assert.equal(result.assignments[0]?.slotId, "sat-endo");
    assert.equal(result.conflicts.length, 0);
  });

  it("assigns hard Saturday slots before ordinary weekday slots", () => {
    const result = generateSchedule({
      seed: "saturday-hard-first",
      employees: [
        withEastonDerivedAvailability({
          id: "regular",
          fullName: "Regular Saturday Worker",
          skillIds: [],
          availability: [
            { weekday: 1, startMinute: 480, endMinute: 1020 },
            { weekday: 6, startMinute: 480, endMinute: 1020 },
          ],
          weeklyAssignmentLimit: 1,
          workPattern: {
            kind: "NON_ENDOSCOPY_SATURDAY",
            requiredSaturdayShiftCategory: "SATURDAY",
            saturdayPaidHours: 6,
            extraHourWeekdays: [1, 4],
          },
        }),
      ],
      taskTypes: [
        {
          id: "background",
          code: "BACKGROUND",
          name: "Background",
          requiredSkillIds: [],
          isBackground: true,
        },
      ],
      slots: [
        {
          id: "mon-bg",
          date: "2026-07-06",
          taskTypeId: "background",
          slotIndex: 1,
          startMinute: 480,
          endMinute: 720,
          paidHours: 4,
          shiftCategory: "AM",
          requirementLevel: "REQUIRED",
        },
        {
          id: "sat-short",
          date: "2026-07-11",
          taskTypeId: "background",
          slotIndex: 1,
          startMinute: 480,
          endMinute: 840,
          paidHours: 6,
          shiftCategory: "SATURDAY",
          requirementLevel: "REQUIRED",
        },
      ],
    });

    assert.equal(result.assignments[0]?.slotId, "sat-short");
    assert.equal(result.conflicts[0]?.slotId, "mon-bg");
  });

  it("treats old generic Easton patterns as non-authoritative without an exact Current Easton target", () => {
    const workPattern = getEffectiveWorkPattern({
      employeeWorkPattern: {
        code: "EASTON_NON_ENDOSCOPY_SATURDAY",
        kind: "NON_ENDOSCOPY_SATURDAY",
        targetWeeklyHours: 40,
        saturdayPaidHours: 6,
        requiredSaturdayShiftCategory: "SATURDAY",
        extraHourWeekdays: [],
      },
      scheduleTarget: null,
      expectedWeeklyHours: 40,
    });

    assert.equal(workPattern, null);
  });

  it("requires exact T + Th 0700-1200 extra-hour shifts", () => {
    assert.equal(
      isExtraHourShiftForWeekday(
        {
          date: "2026-07-07",
          startMinute: 420,
          endMinute: 720,
          paidHours: 5,
        },
        2,
      ),
      true,
    );
    assert.equal(
      isExtraHourShiftForWeekday(
        {
          date: "2026-07-09",
          startMinute: 780,
          endMinute: 1080,
          paidHours: 5,
        },
        4,
      ),
      false,
    );

    const validation = validateEmployeeWeekPattern({
      employee: {
        expectedWeeklyHours: 40,
        workPattern: {
          kind: "NON_ENDOSCOPY_SATURDAY",
          targetWeeklyHours: 40,
          requiredSaturdayShiftCategory: "SATURDAY",
          saturdayPaidHours: 6,
          extraHourWeekdays: [2, 4],
        },
      },
      assignments: [
        shift("2026-07-06", "mon-am", "AM", 480, 720, 4),
        shift("2026-07-06", "mon-pm", "PM", 780, 1020, 4),
        shift("2026-07-07", "tue-early", "AM", 420, 720, 5),
        shift("2026-07-07", "tue-pm", "PM", 780, 1020, 4),
        shift("2026-07-08", "wed-am", "AM", 480, 720, 4),
        shift("2026-07-08", "wed-pm", "PM", 780, 1020, 4),
        shift("2026-07-09", "thu-early", "AM", 420, 720, 5),
        shift("2026-07-09", "thu-pm", "PM", 780, 1020, 4),
        shift("2026-07-11", "sat-short", "SATURDAY", 480, 840, 6),
      ],
    });

    assert.deepEqual(validation.satisfiedExtraHourWeekdays, [2, 4]);
    assert.deepEqual(validation.missingExtraHourWeekdays, []);
    assert.equal(validation.totalHours, 40);
    assert.equal(validation.hasRequiredSaturday, true);
  });

  it("allows Monday extra hour via early AM or long PM", () => {
    assert.equal(
      isExtraHourShiftForWeekday(
        {
          date: "2026-07-06",
          startMinute: 420,
          endMinute: 720,
          paidHours: 5,
        },
        1,
      ),
      true,
    );
    assert.equal(
      isExtraHourShiftForWeekday(
        {
          date: "2026-07-06",
          startMinute: 780,
          endMinute: 1080,
          paidHours: 5,
        },
        1,
      ),
      true,
    );

    const validation = validateEmployeeWeekPattern({
      employee: {
        expectedWeeklyHours: 40,
        workPattern: {
          kind: "NON_ENDOSCOPY_SATURDAY",
          targetWeeklyHours: 40,
          requiredSaturdayShiftCategory: "SATURDAY",
          saturdayPaidHours: 6,
          extraHourWeekdays: [1, 3],
        },
      },
      assignments: [
        shift("2026-07-06", "mon-am", "AM", 480, 720, 4),
        shift("2026-07-06", "mon-long-pm", "PM", 780, 1080, 5),
        shift("2026-07-07", "tue-am", "AM", 480, 720, 4),
        shift("2026-07-07", "tue-pm", "PM", 780, 1020, 4),
        shift("2026-07-08", "wed-early", "AM", 420, 720, 5),
        shift("2026-07-08", "wed-pm", "PM", 780, 1020, 4),
        shift("2026-07-09", "thu-am", "AM", 480, 720, 4),
        shift("2026-07-09", "thu-pm", "PM", 780, 1020, 4),
        shift("2026-07-11", "sat-short", "SATURDAY", 480, 840, 6),
      ],
    });

    assert.deepEqual(validation.satisfiedExtraHourWeekdays, [1, 3]);
    assert.equal(validation.totalHours, 40);
  });

  it("keeps Saturday/endoscopy employees at 40 without weekday extra-hour requirements", () => {
    const validation = validateEmployeeWeekPattern({
      employee: {
        expectedWeeklyHours: 40,
        workPattern: {
          kind: "ENDOSCOPY_SATURDAY",
          targetWeeklyHours: 40,
          requiredSaturdayShiftCategory: "ENDO",
          saturdayPaidHours: 8,
          extraHourWeekdays: [],
        },
      },
      assignments: [
        shift("2026-07-07", "tue-am", "AM", 480, 720, 4),
        shift("2026-07-07", "tue-pm", "PM", 780, 1020, 4),
        shift("2026-07-08", "wed-am", "AM", 480, 720, 4),
        shift("2026-07-08", "wed-pm", "PM", 780, 1020, 4),
        shift("2026-07-09", "thu-am", "AM", 480, 720, 4),
        shift("2026-07-09", "thu-pm", "PM", 780, 1020, 4),
        shift("2026-07-10", "fri-am", "AM", 480, 720, 4),
        shift("2026-07-10", "fri-pm", "PM", 780, 1020, 4),
        shift("2026-07-11", "sat-endo", "ENDO", 360, 840, 8),
      ],
    });

    assert.deepEqual(validation.requiredExtraHourWeekdays, []);
    assert.equal(validation.hasRequiredSaturday, true);
    assert.equal(validation.totalHours, 40);
  });

  it("builds a Group Saturday skeleton with no weekday early-start or long-PM shifts", () => {
    const employee: SchedulerEmployee = {
      id: "angela",
      fullName: "Angela Jiao",
      skillIds: [],
      availability: mondayThroughFriday.concat(allDaySaturday),
      targetWeeklyHours: 40,
      workPattern: {
        code: "EASTON_GROUP_SATURDAY",
        kind: "ENDOSCOPY_SATURDAY",
        requiredSaturdayShiftCategory: "ENDO",
        saturdayPaidHours: 8,
        extraHourWeekdays: [],
      },
    };
    const skeleton = buildJulyWeekSkeletons({
      employees: [employee],
      shiftBlocks: julyWeekShiftBlocks(),
    }).get("angela");

    assert.ok(skeleton);
    assert.equal(skeleton.requiredSaturdayShiftBlockId, "sat-endo");
    assert.equal(skeleton.allowedShiftBlockIds.includes("sat-short"), false);
    assert.equal(skeleton.allowedShiftBlockIds.includes("mon-early"), false);
    assert.equal(skeleton.allowedShiftBlockIds.includes("mon-long-pm"), false);
    assert.equal(skeleton.allowedShiftBlockIds.includes("tue-early"), false);
    assert.deepEqual(
      skeleton.plannedDays.map((day) => [day.date, day.kind]),
      [
        ["2026-07-06", "OFF"],
        ["2026-07-07", "NORMAL_FULL_DAY"],
        ["2026-07-08", "NORMAL_FULL_DAY"],
        ["2026-07-09", "NORMAL_FULL_DAY"],
        ["2026-07-10", "NORMAL_FULL_DAY"],
        ["2026-07-11", "SATURDAY_ENDO"],
      ],
    );
    assert.equal(
      skeleton.requiredShiftBlockIds
        .map(
          (id) => julyWeekShiftBlocks().find((shiftBlock) => shiftBlock.id === id)
            ?.paidHours ?? 0,
        )
        .reduce((total, hours) => total + hours, 0),
      40,
    );
  });

  it("rejects Group Saturday assignments outside the July skeleton", () => {
    const baseEmployee: SchedulerEmployee = {
      id: "angela",
      fullName: "Angela Jiao",
      skillIds: [],
      availability: [
        { weekday: 1, startMinute: 0, endMinute: 24 * 60 },
        { weekday: 2, startMinute: 0, endMinute: 24 * 60 },
        { weekday: 6, startMinute: 0, endMinute: 24 * 60 },
      ],
      targetWeeklyHours: 40,
      workPattern: {
        code: "EASTON_GROUP_SATURDAY",
        kind: "ENDOSCOPY_SATURDAY",
        requiredSaturdayShiftCategory: "ENDO",
        saturdayPaidHours: 8,
        extraHourWeekdays: [],
      },
    };
    const skeleton = buildJulyWeekSkeletons({
      employees: [baseEmployee],
      shiftBlocks: julyWeekShiftBlocks(),
    }).get("angela");
    const employee = { ...baseEmployee, julyWeekSkeleton: skeleton };
    const result = generateSchedule({
      seed: "reject-endo-extra-hours",
      employees: [employee],
      taskTypes: [
        {
          id: "background",
          code: "BACKGROUND",
          name: "Background",
          requiredSkillIds: [],
          isBackground: true,
        },
      ],
      slots: [
        {
          id: "mon-long-pm",
          date: "2026-07-06",
          shiftBlockId: "mon-long-pm",
          shiftCategory: "PM",
          paidHours: 5,
          taskTypeId: "background",
          slotIndex: 1,
          startMinute: 780,
          endMinute: 1080,
          requirementLevel: "REQUIRED",
        },
        {
          id: "tue-early",
          date: "2026-07-07",
          shiftBlockId: "tue-early",
          shiftCategory: "AM",
          paidHours: 5,
          taskTypeId: "background",
          slotIndex: 2,
          startMinute: 420,
          endMinute: 720,
          requirementLevel: "REQUIRED",
        },
      ],
    });

    assert.equal(result.assignments.length, 0);
    assert.equal(result.conflicts.length, 2);
    assert.equal(
      result.conflicts.every((conflict) =>
        conflict.rejectedCandidates.some((candidate) =>
          candidate.reasons.includes("Outside Current Easton work skeleton"),
        ),
      ),
      true,
    );
  });

  it("uses only the configured extra weekdays for a T + Th skeleton", () => {
    const employee: SchedulerEmployee = {
      id: "yvonne",
      fullName: "Yvonne Kuo",
      skillIds: [],
      availability: mondayThroughFriday.concat(allDaySaturday),
      targetWeeklyHours: 40,
      workPattern: {
        code: "EASTON_GROUP_T_TH",
        kind: "NON_ENDOSCOPY_SATURDAY",
        requiredSaturdayShiftCategory: "SATURDAY",
        saturdayPaidHours: 6,
        extraHourWeekdays: [2, 4],
      },
    };
    const skeleton = buildJulyWeekSkeletons({
      employees: [employee],
      shiftBlocks: julyWeekShiftBlocks(),
    }).get("yvonne");

    assert.ok(skeleton);
    assert.equal(skeleton.requiredSaturdayShiftBlockId, "sat-short");
    assert.equal(skeleton.allowedShiftBlockIds.includes("sat-endo"), false);
    assert.equal(skeleton.allowedShiftBlockIds.includes("tue-early"), true);
    assert.equal(skeleton.allowedShiftBlockIds.includes("thu-early"), true);
    assert.equal(skeleton.allowedShiftBlockIds.includes("wed-early"), false);
    assert.equal(skeleton.allowedShiftBlockIds.includes("mon-long-pm"), false);
    assert.equal(
      skeleton.requiredShiftBlockIds
        .map(
          (id) => julyWeekShiftBlocks().find((shiftBlock) => shiftBlock.id === id)
            ?.paidHours ?? 0,
        )
        .reduce((total, hours) => total + hours, 0),
      40,
    );
  });

  it("keeps BG top-off inside skeleton and below the 40-hour cap", () => {
    const baseEmployee: SchedulerEmployee = {
      id: "angela",
      fullName: "Angela Jiao",
      skillIds: [],
      availability: [{ weekday: 2, startMinute: 0, endMinute: 24 * 60 }],
      targetWeeklyHours: 40,
      scheduledHoursThisWeek: 36,
      workPattern: {
        code: "EASTON_GROUP_SATURDAY",
        kind: "ENDOSCOPY_SATURDAY",
        requiredSaturdayShiftCategory: "ENDO",
        saturdayPaidHours: 8,
        extraHourWeekdays: [],
      },
    };
    const skeleton = buildJulyWeekSkeletons({
      employees: [baseEmployee],
      shiftBlocks: julyWeekShiftBlocks(),
    }).get("angela");
    const result = generateSchedule({
      seed: "bg-inside-skeleton-only",
      employees: [{ ...baseEmployee, julyWeekSkeleton: skeleton }],
      taskTypes: [
        {
          id: "background",
          code: "BACKGROUND",
          name: "Background",
          requiredSkillIds: [],
          isBackground: true,
        },
      ],
      slots: [
        {
          id: "tue-early",
          date: "2026-07-07",
          shiftBlockId: "tue-early",
          shiftCategory: "AM",
          paidHours: 5,
          taskTypeId: "background",
          slotIndex: 1,
          startMinute: 420,
          endMinute: 720,
          requirementLevel: "REQUIRED",
        },
        {
          id: "tue-am",
          date: "2026-07-07",
          shiftBlockId: "tue-am",
          shiftCategory: "AM",
          paidHours: 4,
          taskTypeId: "background",
          slotIndex: 2,
          startMinute: 480,
          endMinute: 720,
          requirementLevel: "REQUIRED",
        },
      ],
    });

    assert.deepEqual(
      result.assignments.map((assignment) => assignment.slotId),
      ["tue-am"],
    );
    assert.equal(result.conflicts[0]?.slotId, "tue-early");
    assert.equal(
      result.conflicts[0]?.rejectedCandidates[0]?.reasons.includes(
        "Outside Current Easton work skeleton",
      ),
      true,
    );
  });

  it("reports missing BG minimums and work-pattern shifts", () => {
    const result = evaluateWeeklyHardRequirements({
      targets: [
        {
          employeeId: "yvonne",
          employeeName: "Yvonne",
          workPatternCode: "EASTON_GROUP_T_TH",
          requiredBackgroundAssignments: 2,
          extraHourWeekdays: [2, 4],
          expectedWeeklyHours: 40,
        },
      ],
      assignments: [
        {
          employeeId: "yvonne",
          date: "2026-07-07",
          shiftBlockId: "tue-regular",
          shiftCategory: "AM",
          startMinute: 480,
          endMinute: 720,
          paidHours: 4,
          taskTypeCode: "BACKGROUND",
          isBackground: true,
        },
      ],
    });

    assert.equal(result.canPublish, false);
    assert.equal(result.bgMinimumIssues.length, 1);
    assert.equal(result.workPatternIssues.length, 3);
    assert.equal(
      result.issues.some((issue) => issue.code === "SATURDAY_PATTERN_UNMET"),
      true,
    );
    assert.equal(
      result.issues.some((issue) => issue.code === "BELOW_EXPECTED_HOURS"),
      true,
    );
    assert.equal(
      result.issues.some((issue) => issue.message.includes("Thu")),
      true,
    );
    assert.equal(
      result.issues.some(
        (issue) =>
          issue.message ===
          "Yvonne is in T + Th but missing Tuesday 0700-1200.",
      ),
      true,
    );
  });

  it("blocks meaningful imported targets that have no work-pattern group", () => {
    const result = evaluateWeeklyHardRequirements({
      targets: [
        {
          employeeId: "rowan",
          employeeName: "Rowan",
          workPatternCode: null,
          requiresWorkPattern: true,
          requiredBackgroundAssignments: 0,
          extraHourWeekdays: [],
          expectedWeeklyHours: 40,
        },
        {
          employeeId: "placeholder",
          employeeName: "Placeholder",
          workPatternCode: null,
          requiresWorkPattern: false,
          requiredBackgroundAssignments: 0,
          extraHourWeekdays: [],
          expectedWeeklyHours: 0,
        },
      ],
      assignments: [],
    });

    assert.equal(result.canPublish, false);
    assert.equal(result.workPatternIssues.length, 1);
    assert.equal(result.workPatternIssues[0]?.code, "WORK_PATTERN_MISSING");
  });

  it("excludes zero-hour employees from patient-shift minimum validation", () => {
    const result = evaluateWeeklyHardRequirements({
      targets: [
        {
          employeeId: "sean",
          employeeName: "Sean Fei",
          workPatternCode: "EASTON_GROUP_M_TH",
          requiredBackgroundAssignments: 0,
          extraHourWeekdays: [1, 4],
          expectedWeeklyHours: 0,
        },
      ],
      assignments: [],
    });

    assert.equal(result.patientRangeIssues.length, 0);
    assert.equal(
      result.issues.some((issue) => issue.code === "PATIENT_SHIFT_MINIMUM_UNMET"),
      false,
    );
  });

  it("excludes zero-hour employees from BG minimum validation", () => {
    const result = evaluateWeeklyHardRequirements({
      targets: [
        {
          employeeId: "john",
          employeeName: "John Leung",
          workPatternCode: "EASTON_GROUP_M_TH",
          requiredBackgroundAssignments: 5,
          extraHourWeekdays: [1, 4],
          expectedWeeklyHours: 0,
        },
      ],
      assignments: [],
    });

    assert.equal(result.bgMinimumIssues.length, 0);
    assert.equal(
      result.issues.some((issue) => issue.code === "BG_MINIMUM_UNMET"),
      false,
    );
  });

  it("excludes zero-hour employees from 40-hour validation", () => {
    const result = evaluateWeeklyHardRequirements({
      targets: [
        {
          employeeId: "john",
          employeeName: "John Leung",
          workPatternCode: "EASTON_GROUP_M_TH",
          requiredBackgroundAssignments: 0,
          extraHourWeekdays: [1, 4],
          expectedWeeklyHours: 0,
        },
      ],
      assignments: [],
    });

    assert.equal(
      result.issues.some((issue) => issue.code === "BELOW_EXPECTED_HOURS"),
      false,
    );
    assert.equal(
      result.issues.some((issue) => issue.code === "ABOVE_EXPECTED_HOURS"),
      false,
    );
  });

  it("does not let zero-hour employees block publishing", () => {
    const result = evaluateWeeklyHardRequirements({
      targets: [
        {
          employeeId: "john",
          employeeName: "John Leung",
          workPatternCode: "EASTON_GROUP_M_TH",
          requiresWorkPattern: true,
          requiredBackgroundAssignments: 5,
          extraHourWeekdays: [1, 4],
          expectedWeeklyHours: 0,
        },
      ],
      assignments: [],
    });

    assert.equal(result.canPublish, true);
    assert.equal(result.issues.length, 0);
  });

  it("ignores special excluded Easton targets in hard requirement validation", () => {
    const result = evaluateWeeklyHardRequirements({
      targets: [
        {
          employeeId: "krishi",
          employeeName: "Krishi",
          scheduleEligibility: "SPECIAL_EXCLUDED",
          scheduleEligibilityReason: "Special role row",
          workPatternCode: null,
          requiresWorkPattern: true,
          requiredBackgroundAssignments: 5,
          extraHourWeekdays: [],
          expectedWeeklyHours: 40,
        },
      ],
      assignments: [],
    });

    assert.equal(result.canPublish, true);
    assert.equal(result.issues.length, 0);
  });

  it("validates BG minimum separately from 40-hour work-pattern math", () => {
    const result = evaluateWeeklyHardRequirements({
      targets: [
        {
          employeeId: "katie",
          employeeName: "Katie",
          workPatternCode: "EASTON_GROUP_M_W",
          requiredBackgroundAssignments: 2,
          extraHourWeekdays: [1, 3],
          expectedWeeklyHours: 40,
        },
      ],
      assignments: [
        {
          employeeId: "katie",
          date: "2026-07-06",
          shiftBlockId: "mon-long-pm",
          shiftCategory: "PM",
          startMinute: 780,
          endMinute: 1080,
          paidHours: 5,
          taskTypeCode: "NEW_GI",
          isBackground: false,
        },
        {
          employeeId: "katie",
          date: "2026-07-08",
          shiftBlockId: "wed-early",
          shiftCategory: "AM",
          startMinute: 420,
          endMinute: 720,
          paidHours: 5,
          taskTypeCode: "FOLLOWUP",
          isBackground: false,
        },
        ...[
          ["2026-07-06", "mon-am", "AM", 480, 720, 4],
          ["2026-07-07", "tue-am", "AM", 480, 720, 4],
          ["2026-07-07", "tue-pm", "PM", 780, 1020, 4],
          ["2026-07-08", "wed-pm", "PM", 780, 1020, 4],
          ["2026-07-09", "thu-am", "AM", 480, 720, 4],
          ["2026-07-09", "thu-pm", "PM", 780, 1020, 4],
          ["2026-07-11", "sat-short", "SATURDAY", 480, 840, 6],
        ].map(([date, id, category, start, end, hours]) => ({
          employeeId: "katie",
          date: String(date),
          shiftBlockId: String(id),
          shiftCategory: String(category),
          startMinute: Number(start),
          endMinute: Number(end),
          paidHours: Number(hours),
          taskTypeCode: "NEW_ALLERGY",
          isBackground: false,
        })),
      ],
    });

    assert.equal(result.bgMinimumIssues.length, 1);
    assert.equal(
      result.issues.some((issue) => issue.code === "BELOW_EXPECTED_HOURS"),
      false,
    );
    assert.equal(
      result.issues.some((issue) => issue.code === "EXTRA_HOUR_DAY_UNMET"),
      false,
    );
  });

  it("blocks Group Saturday over-target and forbidden weekday extra-hour assignments", () => {
    const result = evaluateWeeklyHardRequirements({
      targets: [
        {
          employeeId: "angela",
          employeeName: "Angela Jiao",
          workPatternCode: "EASTON_GROUP_SATURDAY",
          workPatternKind: "ENDOSCOPY_SATURDAY",
          requiredSaturdayShiftCategory: "ENDO",
          saturdayPaidHours: 8,
          requiredBackgroundAssignments: 0,
          extraHourWeekdays: [],
          expectedWeeklyHours: 40,
        },
      ],
      assignments: [
        shift("2026-07-07", "tue-am", "AM", 480, 720, 4),
        shift("2026-07-07", "tue-pm", "PM", 780, 1020, 4),
        shift("2026-07-08", "wed-am", "AM", 480, 720, 4),
        shift("2026-07-08", "wed-pm", "PM", 780, 1020, 4),
        shift("2026-07-09", "thu-am", "AM", 480, 720, 4),
        shift("2026-07-09", "thu-pm", "PM", 780, 1020, 4),
        shift("2026-07-10", "fri-am", "AM", 480, 720, 4),
        shift("2026-07-10", "fri-pm", "PM", 780, 1020, 4),
        shift("2026-07-11", "sat-endo", "ENDO", 360, 840, 8),
        shift("2026-07-06", "mon-long-pm", "PM", 780, 1080, 5),
      ].map((assignment) => ({
        employeeId: "angela",
        taskTypeCode: "BACKGROUND",
        isBackground: true,
        ...assignment,
      })),
    });

    assert.equal(result.canPublish, false);
    assert.equal(
      result.issues.some((issue) => issue.code === "ABOVE_EXPECTED_HOURS"),
      true,
    );
    assert.equal(
      result.workPatternIssues.some(
        (issue) => issue.code === "FORBIDDEN_WORK_PATTERN_SHIFT",
      ),
      true,
    );
  });

  it("passes when BG, patient range, Saturday group, and extra-hour days are met", () => {
    const result = evaluateWeeklyHardRequirements({
      targets: [
        {
          employeeId: "yvonne",
          employeeName: "Yvonne",
          workPatternCode: "EASTON_GROUP_T_TH",
          requiredBackgroundAssignments: 2,
          extraHourWeekdays: [2, 4],
          expectedWeeklyHours: 20,
        },
      ],
      assignments: [
        {
          employeeId: "yvonne",
          date: "2026-07-07",
          shiftBlockId: "tue-early",
          shiftCategory: "AM",
          startMinute: 420,
          endMinute: 720,
          paidHours: 5,
          taskTypeCode: "BACKGROUND",
          isBackground: true,
        },
        {
          employeeId: "yvonne",
          date: "2026-07-09",
          shiftBlockId: "thu-early",
          shiftCategory: "AM",
          startMinute: 420,
          endMinute: 720,
          paidHours: 5,
          taskTypeCode: "BACKGROUND",
          isBackground: true,
        },
        {
          employeeId: "yvonne",
          date: "2026-07-10",
          shiftBlockId: "fri-am",
          shiftCategory: "AM",
          startMinute: 480,
          endMinute: 720,
          paidHours: 4,
          taskTypeCode: "PCP",
          isBackground: false,
        },
        {
          employeeId: "yvonne",
          date: "2026-07-11",
          shiftBlockId: "sat-short",
          shiftCategory: "SATURDAY",
          startMinute: 480,
          endMinute: 840,
          paidHours: 6,
          taskTypeCode: "NEW_ALLERGY",
          isBackground: false,
        },
      ],
    });

    assert.equal(result.canPublish, true);
    assert.equal(result.issues.length, 0);
  });

  it("counts only literal BACKGROUND assignments toward imported BG minimums", () => {
    const nonLiteralCodes = [
      "FRONT_BACKGROUND",
      "BOOKING",
      "RESEARCH",
      "FLOAT",
      "IT",
      "PRIOR_AUTHORIZATION",
    ];

    for (const taskTypeCode of nonLiteralCodes) {
      const result = evaluateWeeklyHardRequirements({
        targets: [
          {
            employeeId: "giulia",
            employeeName: "Giulia",
            workPatternCode: null,
            requiredBackgroundAssignments: 1,
            extraHourWeekdays: [],
            expectedWeeklyHours: 40,
          },
        ],
        assignments: [
          {
            employeeId: "giulia",
            date: "2026-07-07",
            shiftBlockId: `${taskTypeCode}-slot`,
            shiftCategory: "AM",
            startMinute: 480,
            endMinute: 720,
            paidHours: 4,
            taskTypeCode,
            isBackground: true,
          },
        ],
      });

      assert.equal(
        result.bgMinimumIssues[0]?.message,
        "Giulia has 0/1 required BG assignments inside their 40-hour target.",
      );
    }

    const literal = evaluateWeeklyHardRequirements({
      targets: [
        {
          employeeId: "giulia",
          employeeName: "Giulia",
          workPatternCode: null,
          requiredBackgroundAssignments: 1,
          extraHourWeekdays: [],
          expectedWeeklyHours: 40,
        },
      ],
      assignments: [
        {
          employeeId: "giulia",
          date: "2026-07-07",
          shiftBlockId: "literal-bg",
          shiftCategory: "AM",
          startMinute: 480,
          endMinute: 720,
          paidHours: 4,
          taskTypeCode: "BACKGROUND",
          isBackground: true,
        },
      ],
    });

    assert.equal(literal.bgMinimumIssues.length, 0);
  });

  it("maps Easton BG target onto the editable employee BG field", () => {
    const update = eastonEmployeeProfileUpdateFromTarget(
      {
        requiredBackgroundAssignments: 3,
        scheduleEligibility: "ACTIVE_SCHEDULED",
      },
      "work-pattern-id",
    );

    assert.equal("expectedWeeklyHours" in update ? update.expectedWeeklyHours : null, 40);
    assert.equal(update.requiredWeeklyBackgroundShifts, 3);
    assert.equal(update.workPatternId, "work-pattern-id");
  });

  it("marks special Easton rows ineligible for ordinary scheduling", () => {
    const update = eastonEmployeeProfileUpdateFromTarget(
      {
        requiredBackgroundAssignments: 5,
        scheduleEligibility: "SPECIAL_EXCLUDED",
      },
      "work-pattern-id",
    );

    assert.equal(update.scheduleEligible, false);
    assert.equal(update.requiredWeeklyBackgroundShifts, 0);
    assert.equal(update.workPatternId, null);
  });

  it("uses the editable employee BG minimum ahead of the imported snapshot", () => {
    assert.equal(
      getEffectiveRequiredBackgroundAssignments({
        employeeRequiredBackgroundAssignments: 5,
        scheduleTarget: { requiredBackgroundAssignments: 2 },
      }),
      5,
    );
  });

  it("assigns Saturday endoscopy slots only to the endoscopy Saturday group", () => {
    const result = generateSchedule({
      seed: "july-saturday-group",
      employees: [
        {
          id: "endo",
          fullName: "Endo Worker",
          skillIds: [],
          availability: [{ weekday: 6, startMinute: 0, endMinute: 24 * 60 }],
          workPattern: {
            kind: "ENDOSCOPY_SATURDAY",
            saturdayPaidHours: 8,
            requiredSaturdayShiftCategory: "ENDO",
            extraHourWeekdays: [],
          },
        },
        {
          id: "regular",
          fullName: "Regular Saturday Worker",
          skillIds: [],
          availability: [{ weekday: 6, startMinute: 0, endMinute: 24 * 60 }],
          workPattern: {
            kind: "NON_ENDOSCOPY_SATURDAY",
            saturdayPaidHours: 6,
            requiredSaturdayShiftCategory: "SATURDAY",
            extraHourWeekdays: [1, 4],
          },
        },
      ],
      taskTypes: [
        {
          id: "endoscopy",
          code: "ENDOSCOPY",
          name: "Endoscopy",
          requiredSkillIds: [],
          isPatientFacing: true,
          isClinical: true,
          isEndoscopy: true,
        },
      ],
      slots: [
        {
          id: "sat-endo",
          date: "2026-07-11",
          shiftBlockId: "sat-endo",
          shiftCategory: "ENDO",
          paidHours: 8,
          taskTypeId: "endoscopy",
          slotIndex: 1,
          startMinute: 6 * 60,
          endMinute: 14 * 60,
          requirementLevel: "REQUIRED",
        },
      ],
    });

    assert.equal(result.assignments[0]?.employeeId, "endo");
  });

  it("reserves Easton Saturday/Endoscopy targets into real Endoscopy slots before normal skill scoring", () => {
    const employees: SchedulerEmployee[] = [
      {
        id: "angela",
        fullName: "Angela",
        skillIds: [],
        availability: [{ weekday: 6, startMinute: 6 * 60, endMinute: 14 * 60 }],
        workPattern: {
          kind: "ENDOSCOPY_SATURDAY",
          saturdayPaidHours: 8,
          requiredSaturdayShiftCategory: "ENDO",
          extraHourWeekdays: [],
        },
        targetTaskAssignments: {
          endoscopy: 1,
        },
      },
      {
        id: "regular",
        fullName: "Regular Saturday Worker",
        skillIds: ["procedure-skill"],
        availability: [{ weekday: 6, startMinute: 6 * 60, endMinute: 14 * 60 }],
        workPattern: {
          kind: "NON_ENDOSCOPY_SATURDAY",
          saturdayPaidHours: 6,
          requiredSaturdayShiftCategory: "SATURDAY",
          extraHourWeekdays: [1, 4],
        },
      },
    ];
    const taskTypes: SchedulerTaskType[] = [
      {
        id: "endoscopy",
        code: "ENDOSCOPY",
        name: "Endoscopy",
        requiredSkillIds: ["procedure-skill"],
        isPatientFacing: true,
        isClinical: true,
        isSkilled: true,
        isEndoscopy: true,
      },
    ];
    const baseSlots: SchedulerTaskSlot[] = [
      {
        id: "sat-endo-3",
        date: "2026-07-11",
        shiftBlockId: "sat-endo",
        shiftCategory: "ENDO",
        paidHours: 8,
        taskTypeId: "endoscopy",
        slotIndex: 3,
        startMinute: 6 * 60,
        endMinute: 14 * 60,
        requirementLevel: "REQUIRED",
      },
    ];
    const reservationPlan = buildJulySaturdayReservationPlan({
      date: "2026-07-11",
      employees,
      slots: baseSlots,
      taskTypes,
    });
    const slots = baseSlots.map((slot) => ({
      ...slot,
      reservedEmployeeIds: reservationPlan.reservationsBySlotId.get(slot.id),
    }));
    const result = generateSchedule({
      seed: "july-endo-reservation",
      employees,
      taskTypes,
      slots,
    });

    assert.deepEqual(reservationPlan.unresolved, []);
    assert.deepEqual(reservationPlan.reservations, [
      {
        slotId: "sat-endo-3",
        employeeId: "angela",
        reason: "EASTON_ENDOSCOPY_SATURDAY",
      },
    ]);
    assert.equal(result.assignments.length, 1);
    assert.equal(result.assignments[0]?.employeeId, "angela");
    assert.equal(result.assignments[0]?.source, "GENERATED");
    assert.equal(result.conflicts.length, 0);
  });

  it("reserves all eight imported Easton Endoscopy targets into Saturday 0600-1400 slots", () => {
    const endoscopyNames = [
      "Angela",
      "Easton",
      "Gisella",
      "Giulia",
      "Josh",
      "Maryn",
      "Nicole",
      "Rowan",
    ];
    const employees: SchedulerEmployee[] = endoscopyNames.map((name) => ({
      id: name.toLowerCase(),
      fullName: name,
      skillIds: [],
      availability: [{ weekday: 6, startMinute: 6 * 60, endMinute: 14 * 60 }],
      workPattern: {
        kind: "ENDOSCOPY_SATURDAY",
        saturdayPaidHours: 8,
        requiredSaturdayShiftCategory: "ENDO",
        extraHourWeekdays: [],
      },
      targetTaskAssignments: {
        endoscopy: 1,
      },
    }));
    const taskTypes: SchedulerTaskType[] = [
      {
        id: "endoscopy",
        code: "ENDOSCOPY",
        name: "Endoscopy",
        requiredSkillIds: ["procedure-skill"],
        isPatientFacing: true,
        isClinical: true,
        isSkilled: true,
        isEndoscopy: true,
      },
    ];
    const baseSlots: SchedulerTaskSlot[] = Array.from({ length: 8 }, (_, index) => ({
      id: `sat-endo-${index + 1}`,
      date: "2026-07-11",
      shiftBlockId: "sat-endo",
      shiftCategory: "ENDO",
      paidHours: 8,
      taskTypeId: "endoscopy",
      slotIndex: index + 1,
      startMinute: 6 * 60,
      endMinute: 14 * 60,
      requirementLevel: "REQUIRED",
    }));
    const reservationPlan = buildJulySaturdayReservationPlan({
      date: "2026-07-11",
      employees,
      slots: baseSlots,
      taskTypes,
    });
    const slots = baseSlots.map((slot) => ({
      ...slot,
      reservedEmployeeIds: reservationPlan.reservationsBySlotId.get(slot.id),
    }));
    const result = generateSchedule({
      seed: "july-endo-eight-reservations",
      employees,
      taskTypes,
      slots,
    });

    assert.equal(reservationPlan.unresolved.length, 0);
    assert.equal(reservationPlan.reservations.length, 8);
    assert.equal(result.assignments.length, 8);
    assert.deepEqual(
      new Set(result.assignments.map((assignment) => assignment.employeeId)),
      new Set(endoscopyNames.map((name) => name.toLowerCase())),
    );
    assert.equal(result.conflicts.length, 0);
  });

  it("keeps regular Saturday employees out of Endoscopy and reserves them into 0800-1400 work", () => {
    const employees: SchedulerEmployee[] = [
      {
        id: "endo",
        fullName: "Endoscopy Worker",
        skillIds: [],
        availability: [{ weekday: 6, startMinute: 6 * 60, endMinute: 14 * 60 }],
        workPattern: {
          kind: "ENDOSCOPY_SATURDAY",
          saturdayPaidHours: 8,
          requiredSaturdayShiftCategory: "ENDO",
          extraHourWeekdays: [],
        },
      },
      {
        id: "non-endo",
        fullName: "Non Endoscopy Worker",
        skillIds: [],
        availability: [{ weekday: 6, startMinute: 8 * 60, endMinute: 14 * 60 }],
        workPattern: {
          kind: "NON_ENDOSCOPY_SATURDAY",
          saturdayPaidHours: 6,
          requiredSaturdayShiftCategory: "SATURDAY",
          extraHourWeekdays: [2, 4],
        },
      },
    ];
    const taskTypes: SchedulerTaskType[] = [
      {
        id: "endoscopy",
        code: "ENDOSCOPY",
        name: "Endoscopy",
        requiredSkillIds: [],
        isEndoscopy: true,
        isClinical: true,
      },
      {
        id: "allergy",
        code: "ALLERGY",
        name: "Allergy",
        requiredSkillIds: [],
        isClinical: true,
        isPatientFacing: true,
      },
    ];
    const slots: SchedulerTaskSlot[] = [
      {
        id: "sat-endo",
        date: "2026-07-11",
        shiftBlockId: "sat-endo",
        shiftCategory: "ENDO",
        paidHours: 8,
        taskTypeId: "endoscopy",
        slotIndex: 1,
        startMinute: 6 * 60,
        endMinute: 14 * 60,
        requirementLevel: "REQUIRED",
      },
      {
        id: "sat-allergy",
        date: "2026-07-11",
        shiftBlockId: "sat-short",
        shiftCategory: "SATURDAY",
        paidHours: 6,
        taskTypeId: "allergy",
        slotIndex: 1,
        startMinute: 8 * 60,
        endMinute: 14 * 60,
        requirementLevel: "REQUIRED",
      },
    ];
    const reservationPlan = buildJulySaturdayReservationPlan({
      date: "2026-07-11",
      employees,
      slots,
      taskTypes,
    });

    assert.deepEqual(
      reservationPlan.reservations.map((reservation) => [
        reservation.slotId,
        reservation.employeeId,
      ]),
      [
        ["sat-endo", "endo"],
        ["sat-allergy", "non-endo"],
      ],
    );
  });

  it("prioritizes employees below their required BG minimum for background slots", () => {
    const result = generateSchedule({
      seed: "july-bg-minimum",
      employees: [
        {
          id: "needs-bg",
          fullName: "Needs BG",
          skillIds: [],
          availability: [{ weekday: 2, startMinute: 0, endMinute: 24 * 60 }],
          requiredBackgroundAssignments: 2,
        },
        {
          id: "no-bg-target",
          fullName: "No BG Target",
          skillIds: [],
          availability: [{ weekday: 2, startMinute: 0, endMinute: 24 * 60 }],
          requiredBackgroundAssignments: 0,
        },
      ],
      taskTypes: [
        {
          id: "background",
          code: "BACKGROUND",
          name: "Background",
          requiredSkillIds: [],
          isBackground: true,
        },
      ],
      slots: [
        {
          id: "bg-slot",
          date: "2026-07-07",
          shiftBlockId: "tue-bg",
          shiftCategory: "AM",
          paidHours: 5,
          taskTypeId: "background",
          slotIndex: 1,
          startMinute: 7 * 60,
          endMinute: 12 * 60,
          requirementLevel: "DESIRED",
        },
      ],
      fairness: {
        clinicalShiftWeight: 0,
        patientFacingShiftWeight: 0,
        totalShiftWeight: 0,
        totalHoursWeight: 0,
        saturdayShiftWeight: 0,
        endoscopyShiftWeight: 0,
        patternConsistencyWeight: 0,
        skillRoleBalanceWeight: 10,
        exposureGoalWeight: 0,
        backgroundPenaltyWeight: 0,
      },
    });

    assert.equal(result.assignments[0]?.employeeId, "needs-bg");
  });

  it("honors employee-specific BG minimum reservations before patient slots", () => {
    const result = generateSchedule({
      seed: "july-bg-minimum-reservation",
      employees: [
        {
          id: "easton",
          fullName: "Easton Liaw",
          skillIds: ["clinic"],
          availability: [{ weekday: 2, startMinute: 0, endMinute: 24 * 60 }],
          requiredBackgroundAssignments: 5,
        },
        {
          id: "coverage",
          fullName: "Coverage Employee",
          skillIds: ["clinic"],
          availability: [{ weekday: 2, startMinute: 0, endMinute: 24 * 60 }],
          requiredBackgroundAssignments: 0,
        },
      ],
      taskTypes: [
        {
          id: "background",
          code: "BACKGROUND",
          name: "Background",
          requiredSkillIds: [],
          isBackground: true,
        },
        {
          id: "new-gi",
          code: "NEW_GI",
          name: "New GI",
          requiredSkillIds: ["clinic"],
          isPatientFacing: true,
          isClinical: true,
        },
      ],
      slots: [
        {
          id: "patient-slot",
          date: "2026-07-07",
          shiftBlockId: "tue-am",
          shiftCategory: "AM",
          paidHours: 4,
          taskTypeId: "new-gi",
          slotIndex: 1,
          startMinute: 8 * 60,
          endMinute: 12 * 60,
          requirementLevel: "REQUIRED",
        },
        {
          id: "bg-minimum-slot",
          date: "2026-07-07",
          shiftBlockId: "tue-am",
          shiftCategory: "AM",
          paidHours: 4,
          taskTypeId: "background",
          slotIndex: 2,
          source: EMPLOYEE_BG_MINIMUM_SOURCE,
          startMinute: 8 * 60,
          endMinute: 12 * 60,
          requirementLevel: "REQUIRED",
          reservedEmployeeIds: ["easton"],
          protectedFromPull: true,
        },
      ],
      fairness: {
        clinicalShiftWeight: 0,
        patientFacingShiftWeight: 0,
        totalShiftWeight: 0,
        totalHoursWeight: 0,
        saturdayShiftWeight: 0,
        endoscopyShiftWeight: 0,
        patternConsistencyWeight: 0,
        skillRoleBalanceWeight: 0,
        exposureGoalWeight: 0,
        backgroundPenaltyWeight: 0,
      },
    });

    assert.equal(
      result.assignments.find((assignment) => assignment.slotId === "bg-minimum-slot")
        ?.employeeId,
      "easton",
    );
    assert.equal(
      result.assignments.find((assignment) => assignment.slotId === "patient-slot")
        ?.employeeId,
      "coverage",
    );
  });

  it("pulls movable optional BG into required clinic coverage before leaving a shortage", () => {
    const result = generateSchedule({
      seed: "clinic-before-extra-bg",
      employees: [
        {
          id: "pcp-bg-1",
          fullName: "PCP and BG 1",
          skillIds: ["pcp"],
          availability: [{ weekday: 1, startMinute: 0, endMinute: 24 * 60 }],
          targetWeeklyHours: 4,
          julyWeekSkeleton: {
            employeeId: "pcp-bg-1",
            groupLabel: "Test",
            targetHours: 4,
            allowedShiftBlockIds: ["mon-am", "mon-pm"],
            requiredShiftBlockIds: [],
            forbiddenShiftBlockIds: [],
            requiredSaturdayShiftBlockId: null,
            requiredExtraHourWeekdays: [],
            plannedDays: [
              {
                date: "2026-07-06",
                kind: "NORMAL_FULL_DAY",
                allowedShiftBlockIds: ["mon-am", "mon-pm"],
                requiredShiftBlockIds: [],
              },
            ],
          },
        },
        {
          id: "pcp-bg-2",
          fullName: "PCP and BG 2",
          skillIds: ["pcp"],
          availability: [{ weekday: 1, startMinute: 0, endMinute: 24 * 60 }],
          targetWeeklyHours: 4,
          julyWeekSkeleton: {
            employeeId: "pcp-bg-2",
            groupLabel: "Test",
            targetHours: 4,
            allowedShiftBlockIds: ["mon-am", "mon-pm"],
            requiredShiftBlockIds: [],
            forbiddenShiftBlockIds: [],
            requiredSaturdayShiftBlockId: null,
            requiredExtraHourWeekdays: [],
            plannedDays: [
              {
                date: "2026-07-06",
                kind: "NORMAL_FULL_DAY",
                allowedShiftBlockIds: ["mon-am", "mon-pm"],
                requiredShiftBlockIds: [],
              },
            ],
          },
        },
      ],
      taskTypes: [
        {
          id: "background",
          code: "BACKGROUND",
          name: "Background",
          requiredSkillIds: [],
          isBackground: true,
        },
        {
          id: "pcp",
          code: "PCP",
          name: "PCP",
          requiredSkillIds: ["pcp"],
          isPatientFacing: true,
          isClinical: true,
        },
      ],
      slots: [
        {
          id: "required-pcp",
          date: "2026-07-06",
          shiftBlockId: "mon-am",
          shiftCategory: "AM",
          paidHours: 4,
          taskTypeId: "pcp",
          slotIndex: 1,
          requiredStaff: 2,
          startMinute: 8 * 60,
          endMinute: 12 * 60,
          requirementLevel: "REQUIRED",
        },
        {
          id: "optional-bg-1",
          date: "2026-07-06",
          shiftBlockId: "mon-pm",
          shiftCategory: "PM",
          paidHours: 4,
          taskTypeId: "background",
          slotIndex: 1,
          source: "GENERATED_BACKGROUND_TOP_OFF",
          startMinute: 13 * 60,
          endMinute: 17 * 60,
          requirementLevel: "OPTIONAL",
          reservedEmployeeIds: ["pcp-bg-1"],
          protectedFromPull: false,
        },
        {
          id: "optional-bg-2",
          date: "2026-07-06",
          shiftBlockId: "mon-pm",
          shiftCategory: "PM",
          paidHours: 4,
          taskTypeId: "background",
          slotIndex: 2,
          source: "GENERATED_BACKGROUND_TOP_OFF",
          startMinute: 13 * 60,
          endMinute: 17 * 60,
          requirementLevel: "OPTIONAL",
          reservedEmployeeIds: ["pcp-bg-2"],
          protectedFromPull: false,
        },
      ],
    });

    assert.equal(result.conflicts.length, 0);
    assert.deepEqual(
      result.assignments
        .filter((assignment) => assignment.slotId === "required-pcp")
        .map((assignment) => assignment.employeeId)
        .sort(),
      ["pcp-bg-1", "pcp-bg-2"],
    );
    assert.equal(
      result.assignments.some((assignment) =>
        assignment.slotId.startsWith("optional-bg"),
      ),
      false,
    );
    assert.equal(
      result.repairs.filter((repair) => repair.strategy === "PULL_BACKGROUND")
        .length,
      2,
    );
  });

  it("does not pull literal BG when that would drop the employee below their BG minimum", () => {
    const result = generateSchedule({
      seed: "preserve-required-literal-bg",
      employees: [
        {
          id: "pcp-bg",
          fullName: "PCP and BG",
          skillIds: ["pcp"],
          availability: [{ weekday: 1, startMinute: 0, endMinute: 24 * 60 }],
          targetWeeklyHours: 4,
          requiredBackgroundAssignments: 1,
          julyWeekSkeleton: {
            employeeId: "pcp-bg",
            groupLabel: "Test",
            targetHours: 4,
            allowedShiftBlockIds: ["mon-am", "mon-pm"],
            requiredShiftBlockIds: [],
            forbiddenShiftBlockIds: [],
            requiredSaturdayShiftBlockId: null,
            requiredExtraHourWeekdays: [],
            plannedDays: [
              {
                date: "2026-07-06",
                kind: "NORMAL_FULL_DAY",
                allowedShiftBlockIds: ["mon-am", "mon-pm"],
                requiredShiftBlockIds: [],
              },
            ],
          },
        },
      ],
      taskTypes: [
        {
          id: "background",
          code: "BACKGROUND",
          name: "Background",
          requiredSkillIds: [],
          isBackground: true,
        },
        {
          id: "pcp",
          code: "PCP",
          name: "PCP",
          requiredSkillIds: ["pcp"],
          isPatientFacing: true,
          isClinical: true,
        },
      ],
      slots: [
        {
          id: "required-pcp",
          date: "2026-07-06",
          shiftBlockId: "mon-am",
          shiftCategory: "AM",
          paidHours: 4,
          taskTypeId: "pcp",
          slotIndex: 1,
          startMinute: 8 * 60,
          endMinute: 12 * 60,
          requirementLevel: "REQUIRED",
        },
        {
          id: "literal-bg",
          date: "2026-07-06",
          shiftBlockId: "mon-pm",
          shiftCategory: "PM",
          paidHours: 4,
          taskTypeId: "background",
          slotIndex: 1,
          source: "BACKGROUND_DEFINITION",
          startMinute: 13 * 60,
          endMinute: 17 * 60,
          requirementLevel: "OPTIONAL",
          reservedEmployeeIds: ["pcp-bg"],
          protectedFromPull: false,
        },
      ],
    });

    assert.equal(
      result.assignments.find((assignment) => assignment.slotId === "literal-bg")
        ?.employeeId,
      "pcp-bg",
    );
    assert.equal(
      result.conflicts.find((conflict) => conflict.slotId === "required-pcp")
        ?.reason,
      "No compatible available employee",
    );
    assert.equal(result.repairs.length, 0);
  });

  it("can reserve five literal BG minimum slots while filling exactly 40 hours", () => {
    const dates = [
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
    ];
    const bgSlots = dates.map((date, index) => ({
      id: `bg-minimum-${index + 1}`,
      date,
      shiftBlockId: `${date}-am`,
      shiftCategory: "AM" as const,
      paidHours: 4,
      taskTypeId: "background",
      slotIndex: 1,
      source: EMPLOYEE_BG_MINIMUM_SOURCE,
      startMinute: 8 * 60,
      endMinute: 12 * 60,
      requirementLevel: "REQUIRED" as const,
      reservedEmployeeIds: ["easton"],
      protectedFromPull: true,
    }));
    const patientSlots = dates.map((date, index) => ({
      id: `patient-${index + 1}`,
      date,
      shiftBlockId: `${date}-pm`,
      shiftCategory: "PM" as const,
      paidHours: 4,
      taskTypeId: "pcp",
      slotIndex: 1,
      startMinute: 13 * 60,
      endMinute: 17 * 60,
      requirementLevel: "REQUIRED" as const,
    }));
    const result = generateSchedule({
      seed: "july-bg-minimum-five",
      employees: [
        {
          id: "easton",
          fullName: "Easton Liaw",
          skillIds: ["clinic"],
          availability: [1, 2, 3, 4, 5].map((weekday) => ({
            weekday,
            startMinute: 0,
            endMinute: 24 * 60,
          })),
          targetWeeklyHours: 40,
          requiredBackgroundAssignments: 5,
          julyWeekSkeleton: {
            employeeId: "easton",
            groupLabel: "Group Saturday",
            targetHours: 40,
            allowedShiftBlockIds: [...bgSlots, ...patientSlots].map(
              (slot) => slot.shiftBlockId,
            ),
            requiredShiftBlockIds: [],
            forbiddenShiftBlockIds: [],
            requiredSaturdayShiftBlockId: null,
            requiredExtraHourWeekdays: [],
            plannedDays: dates.map((date) => ({
              date,
              kind: "NORMAL_FULL_DAY" as const,
              allowedShiftBlockIds: [`${date}-am`, `${date}-pm`],
              requiredShiftBlockIds: [],
            })),
          },
        },
      ],
      taskTypes: [
        {
          id: "background",
          code: "BACKGROUND",
          name: "Background",
          requiredSkillIds: [],
          isBackground: true,
        },
        {
          id: "pcp",
          code: "PCP",
          name: "PCP",
          requiredSkillIds: ["clinic"],
          isPatientFacing: true,
          isClinical: true,
        },
      ],
      slots: [...bgSlots, ...patientSlots],
    });
    const bgAssignments = result.assignments.filter((assignment) =>
      assignment.slotId.startsWith("bg-minimum-"),
    );
    const eastonHours = result.assignments
      .filter((assignment) => assignment.employeeId === "easton")
      .reduce((total, assignment) => {
        const slot = [...bgSlots, ...patientSlots].find(
          (item) => item.id === assignment.slotId,
        );
        return total + (slot?.paidHours ?? 0);
      }, 0);

    assert.equal(result.conflicts.length, 0);
    assert.equal(bgAssignments.length, 5);
    assert.equal(
      bgAssignments.every((assignment) => assignment.employeeId === "easton"),
      true,
    );
    assert.equal(eastonHours, 40);
  });

  it("selects literal BG top-off for an under-40 employee missing BG", () => {
    const employee = topOffEmployee({
      id: "under-bg",
      fullName: "Under BG",
      required: 2,
      assignedBg: 1,
    });
    const backgroundTask = bgTaskType();
    const backgroundSlot = topOffSlot({
      id: "open-bg",
      date: "2026-07-07",
      shiftBlockId: "tue-pm",
      shiftName: "Tuesday 1300-1700",
      taskType: backgroundTask,
      requirementLevel: "OPTIONAL",
      requiredStaff: 1,
    });
    backgroundSlot.currentAssignmentCount = 0;
    const candidate = selectExistingBackgroundTopOffSlot({
      employee,
      taskSlots: [backgroundSlot],
      allAssignments: fillerAssignments(employee.id, "under-bg", 36),
      state: {
        hours: 36,
        backgroundAssignments: 1,
        shiftKeys: new Set(),
      },
    } as never);

    assert.equal(candidate?.id, "open-bg");
    assert.equal(candidate?.taskType.code, "BACKGROUND");
  });

  it("selects flexible non-required work for BG minimum conversion inside the same skeleton", () => {
    const employee = {
      id: "easton",
      fullName: "Easton-like Employee",
      active: true,
      skillIds: [],
      availability: [{ weekday: 2, startMinute: 0, endMinute: 24 * 60 }],
      expectedHours: 40,
      requiredBackgroundAssignments: 5,
    };
    const backgroundTask = {
      id: "background",
      code: "BACKGROUND",
      name: "Background",
      requiredSkillIds: [],
      isBackground: true,
      isPatientFacing: false,
      isClinical: false,
      isSkilled: false,
      isEndoscopy: false,
      isFloat: false,
    };
    const clinicTask = {
      id: "clinic",
      code: "PCP",
      name: "PCP",
      requiredSkillIds: [],
      isBackground: false,
      isPatientFacing: true,
      isClinical: true,
      isSkilled: false,
      isEndoscopy: false,
      isFloat: false,
    };
    const supportTask = {
      id: "support",
      code: "BOOKING",
      name: "Booking",
      requiredSkillIds: [],
      isBackground: true,
      isPatientFacing: false,
      isClinical: false,
      isSkilled: false,
      isEndoscopy: false,
      isFloat: false,
    };
    const slots = [
      {
        id: "required-clinic",
        date: "2026-07-07",
        scheduleDayId: "day",
        shiftBlockId: "am",
        shiftCategory: "AM",
        shiftName: "Tuesday 0800-1200",
        paidHours: 4,
        taskTypeId: "clinic",
        slotIndex: 1,
        requirementLevel: "REQUIRED",
        startMinute: 8 * 60,
        endMinute: 12 * 60,
        minStaff: 1,
        requiredStaff: 1,
        requiredSkillIds: [],
        eligibleEmployeeIds: [],
        taskType: clinicTask,
        source: "STAFFING_RULE",
        currentAssignmentCount: 1,
        assignments: [{ id: "clinic-assignment", employeeId: "easton", locked: false }],
      },
      {
        id: "flex-support",
        date: "2026-07-07",
        scheduleDayId: "day",
        shiftBlockId: "pm",
        shiftCategory: "PM",
        shiftName: "Tuesday 1300-1700",
        paidHours: 4,
        taskTypeId: "support",
        slotIndex: 1,
        requirementLevel: "DESIRED",
        startMinute: 13 * 60,
        endMinute: 17 * 60,
        minStaff: 0,
        requiredStaff: 1,
        requiredSkillIds: [],
        eligibleEmployeeIds: [],
        taskType: supportTask,
        source: "STAFFING_RULE",
        currentAssignmentCount: 1,
        assignments: [{ id: "support-assignment", employeeId: "easton", locked: false }],
      },
      {
        id: "pm-background",
        date: "2026-07-07",
        scheduleDayId: "day",
        shiftBlockId: "pm",
        shiftCategory: "PM",
        shiftName: "Tuesday 1300-1700",
        paidHours: 4,
        taskTypeId: "background",
        slotIndex: 1,
        requirementLevel: "OPTIONAL",
        startMinute: 13 * 60,
        endMinute: 17 * 60,
        minStaff: 0,
        requiredStaff: 1,
        requiredSkillIds: [],
        eligibleEmployeeIds: [],
        taskType: backgroundTask,
        source: "GENERATED_BACKGROUND_TOP_OFF",
        currentAssignmentCount: 0,
        assignments: [],
      },
    ];
    const candidate = selectBackgroundMinimumConversionCandidate({
      employee,
      taskSlots: slots,
      shiftBlocks: [
        {
          id: "am",
          scheduleDayId: "day",
          date: "2026-07-07",
          name: "Tuesday 0800-1200",
          shiftTemplateId: null,
          shiftCategory: "AM",
          startMinute: 8 * 60,
          endMinute: 12 * 60,
          paidHours: 4,
        },
        {
          id: "pm",
          scheduleDayId: "day",
          date: "2026-07-07",
          name: "Tuesday 1300-1700",
          shiftTemplateId: null,
          shiftCategory: "PM",
          startMinute: 13 * 60,
          endMinute: 17 * 60,
          paidHours: 4,
        },
      ],
      backgroundTask,
      allAssignments: [
        {
          slotId: "required-clinic",
          employeeId: "easton",
          date: "2026-07-07",
          taskTypeId: "clinic",
          startMinute: 8 * 60,
          endMinute: 12 * 60,
          shiftBlockId: "am",
          shiftCategory: "AM",
          paidHours: 4,
          isPatientFacing: true,
          isClinical: true,
          isBackground: false,
        },
        {
          slotId: "flex-support",
          employeeId: "easton",
          date: "2026-07-07",
          taskTypeId: "support",
          startMinute: 13 * 60,
          endMinute: 17 * 60,
          shiftBlockId: "pm",
          shiftCategory: "PM",
          paidHours: 4,
          isPatientFacing: false,
          isClinical: false,
          isBackground: true,
        },
      ],
    } as never);

    assert.equal(candidate?.sourceSlot.id, "flex-support");
    assert.equal(candidate?.backgroundSlot?.id, "pm-background");
  });

  it("finds a required-coverage backfill for a 40-hour employee missing literal BG", () => {
    const backgroundTask = bgTaskType();
    const clinicTask = {
      id: "clinic",
      code: "NEW_GI",
      name: "New GI",
      requiredSkillIds: ["clinic"],
      isBackground: false,
      isPatientFacing: true,
      isClinical: true,
      isSkilled: false,
      isEndoscopy: false,
      isFloat: false,
    };
    const missingEmployee = topOffEmployee({
      id: "easton",
      fullName: "Easton Liaw",
      required: 5,
      assignedBg: 4,
      skillIds: ["clinic"],
    });
    const replacementEmployee = topOffEmployee({
      id: "replacement",
      fullName: "Replacement Employee",
      required: 0,
      assignedBg: 0,
      skillIds: ["clinic"],
    });
    const sourceSlot = topOffSlot({
      id: "required-gi",
      date: "2026-07-09",
      shiftBlockId: "thu-am",
      shiftName: "Thursday 0800-1200",
      taskType: clinicTask,
      requirementLevel: "REQUIRED",
      requiredStaff: 1,
    });
    sourceSlot.assignments = [
      topOffAssignment(missingEmployee.id, "required-gi-assignment"),
    ];
    sourceSlot.currentAssignmentCount = 1;
    const employees = [missingEmployee, replacementEmployee];
    const states = new Map<string, TestTopOffState>([
      [
        missingEmployee.id,
        {
          hours: 40,
          backgroundAssignments: 4,
          shiftKeys: new Set(["2026-07-09:thu-am"]),
        },
      ],
      [
        replacementEmployee.id,
        { hours: 36, backgroundAssignments: 0, shiftKeys: new Set() },
      ],
    ]);
    const allAssignments = [
      existingFromTopOffSlot(sourceSlot, missingEmployee.id),
      ...fillerAssignments(missingEmployee.id, "easton", 36),
      ...fillerAssignments(replacementEmployee.id, "replacement", 36),
    ];
    const candidate = selectBackgroundMinimumBackfillCandidate({
      missingEmployee,
      employees,
      states,
      taskSlots: [sourceSlot],
      shiftBlocks: [
        {
          id: "thu-am",
          scheduleDayId: "day",
          date: "2026-07-09",
          name: "Thursday 0800-1200",
          shiftTemplateId: null,
          shiftCategory: "AM",
          startMinute: 8 * 60,
          endMinute: 12 * 60,
          paidHours: 4,
        },
      ],
      backgroundTask,
      allAssignments,
    } as never);

    assert.equal(candidate?.missingEmployee.fullName, "Easton Liaw");
    assert.equal(candidate?.replacementEmployee.id, replacementEmployee.id);
    assert.equal(candidate?.sourceSlot.id, "required-gi");
    assert.equal(candidate?.shiftBlock.id, "thu-am");
    assert.equal(states.get(missingEmployee.id)?.hours, 40);
  });

  it("does not backfill required coverage by pushing a replacement over 40 hours", () => {
    const backgroundTask = bgTaskType();
    const clinicTask = {
      id: "clinic",
      code: "NEW_GI",
      name: "New GI",
      requiredSkillIds: ["clinic"],
      isBackground: false,
      isPatientFacing: true,
      isClinical: true,
      isSkilled: false,
      isEndoscopy: false,
      isFloat: false,
    };
    const missingEmployee = topOffEmployee({
      id: "easton",
      fullName: "Easton Liaw",
      required: 5,
      assignedBg: 4,
      skillIds: ["clinic"],
    });
    const replacementEmployee = topOffEmployee({
      id: "replacement",
      fullName: "Already Full",
      required: 0,
      assignedBg: 0,
      skillIds: ["clinic"],
    });
    const sourceSlot = topOffSlot({
      id: "required-gi",
      date: "2026-07-09",
      shiftBlockId: "thu-am",
      shiftName: "Thursday 0800-1200",
      taskType: clinicTask,
      requirementLevel: "REQUIRED",
      requiredStaff: 1,
    });
    sourceSlot.assignments = [
      topOffAssignment(missingEmployee.id, "required-gi-assignment"),
    ];
    sourceSlot.currentAssignmentCount = 1;
    const states = new Map<string, TestTopOffState>([
      [
        missingEmployee.id,
        {
          hours: 40,
          backgroundAssignments: 4,
          shiftKeys: new Set(["2026-07-09:thu-am"]),
        },
      ],
      [
        replacementEmployee.id,
        { hours: 40, backgroundAssignments: 0, shiftKeys: new Set() },
      ],
    ]);
    const allAssignments = [
      existingFromTopOffSlot(sourceSlot, missingEmployee.id),
      ...fillerAssignments(missingEmployee.id, "easton", 36),
      ...fillerAssignments(replacementEmployee.id, "replacement", 40),
    ];
    const candidate = selectBackgroundMinimumBackfillCandidate({
      missingEmployee,
      employees: [missingEmployee, replacementEmployee],
      states,
      taskSlots: [sourceSlot],
      shiftBlocks: [
        {
          id: "thu-am",
          scheduleDayId: "day",
          date: "2026-07-09",
          name: "Thursday 0800-1200",
          shiftTemplateId: null,
          shiftCategory: "AM",
          startMinute: 8 * 60,
          endMinute: 12 * 60,
          paidHours: 4,
        },
      ],
      backgroundTask,
      allAssignments,
    } as never);
    const diagnostic = buildLiteralBgRoleMixDiagnostics({
      employees: [missingEmployee, replacementEmployee],
      states,
      taskSlots: [sourceSlot],
      shiftBlocks: [
        {
          id: "thu-am",
          scheduleDayId: "day",
          date: "2026-07-09",
          name: "Thursday 0800-1200",
          shiftTemplateId: null,
          shiftCategory: "AM",
          startMinute: 8 * 60,
          endMinute: 12 * 60,
          paidHours: 4,
        },
      ],
      backgroundTask,
      allAssignments,
    } as never).find((item) => item.employeeId === missingEmployee.id);

    assert.equal(candidate, null);
    assert.match(diagnostic?.swapConclusion ?? "", /would exceed 40 hours/);
  });

  it("finds feasible role-mix swaps for Angela, Giulia, and Nicole style BG deficits", () => {
    const backgroundTask = bgTaskType();
    const clinicTask = {
      id: "clinic",
      code: "NEW_GI",
      name: "New GI",
      requiredSkillIds: ["clinic"],
      isBackground: false,
      isPatientFacing: true,
      isClinical: true,
      isSkilled: false,
      isEndoscopy: false,
      isFloat: false,
    };
    const missingEmployees = [
      { id: "angela", fullName: "Angela Jiao", required: 2, assignedBg: 1 },
      {
        id: "giulia",
        fullName: "Giulia Martins Cavalcante",
        required: 3,
        assignedBg: 2,
      },
      { id: "nicole", fullName: "Nicole Pedicini", required: 3, assignedBg: 2 },
    ].map((employee) => topOffEmployee(employee));
    const excessEmployees = [
      { id: "extra-a", fullName: "Extra BG A", required: 1, assignedBg: 2 },
      { id: "extra-b", fullName: "Extra BG B", required: 1, assignedBg: 2 },
      { id: "extra-c", fullName: "Extra BG C", required: 1, assignedBg: 2 },
    ].map((employee) => topOffEmployee(employee));
    const employees = [...missingEmployees, ...excessEmployees];
    const taskSlots: TestTopOffSlot[] = [];
    const allAssignments: TestExistingAssignment[] = [];
    const states = new Map<string, TestTopOffState>();

    employees.forEach((employee, employeeIndex) => {
      states.set(employee.id, {
        hours: 40,
        backgroundAssignments: employee.assignedBg,
        shiftKeys: new Set<string>(),
      });

      for (let bgIndex = 0; bgIndex < employee.assignedBg; bgIndex += 1) {
        const isMissingBgEmployee = missingEmployees.some(
          (missingEmployee) => missingEmployee.id === employee.id,
        );
        const bgDateDay = isMissingBgEmployee
          ? 6 + bgIndex
          : 10 + employeeIndex + bgIndex;
        const slot = topOffSlot({
          id: `${employee.id}-bg-${bgIndex}`,
          date: `2026-07-${String(bgDateDay).padStart(2, "0")}`,
          shiftBlockId: `${employee.id}-bg-block-${bgIndex}`,
          shiftName: `${employee.fullName} BG ${bgIndex}`,
          taskType: backgroundTask,
          requirementLevel: "DESIRED",
        });
        const assignment = topOffAssignment(employee.id, `${slot.id}-assignment`);
        slot.assignments = [assignment];
        slot.currentAssignmentCount = 1;
        taskSlots.push(slot);
        allAssignments.push(existingFromTopOffSlot(slot, employee.id));
      }

      const isMissingBgEmployee = missingEmployees.some(
        (missingEmployee) => missingEmployee.id === employee.id,
      );

      if (isMissingBgEmployee) {
        const sourceSlot = topOffSlot({
          id: `${employee.id}-clinic`,
          date: "2026-07-09",
          shiftBlockId: `${employee.id}-clinic-block`,
          shiftName: `${employee.fullName} clinic`,
          taskType: clinicTask,
          requirementLevel: "REQUIRED",
          requiredStaff: 1,
        });
        const sourceAssignment = topOffAssignment(
          employee.id,
          `${sourceSlot.id}-assignment`,
        );
        sourceSlot.assignments = [sourceAssignment];
        sourceSlot.currentAssignmentCount = 1;
        taskSlots.push(sourceSlot);
        allAssignments.push(existingFromTopOffSlot(sourceSlot, employee.id));
      }

      allAssignments.push(
        ...fillerAssignments(
          employee.id,
          `${employee.id}-${employeeIndex}`,
          40 - (employee.assignedBg + (isMissingBgEmployee ? 1 : 0)) * 4,
        ),
      );
    });

    for (const missingEmployee of missingEmployees) {
      const candidate = selectLiteralBgSwapCandidate({
        missingEmployee,
        employees,
        states,
        taskSlots,
        allAssignments,
      } as never);

      assert.equal(candidate?.missingEmployee.fullName, missingEmployee.fullName);
      assert.equal(candidate?.sourceSlot.requirementLevel, "REQUIRED");
      assert.equal(candidate?.backgroundSlot.taskType.code, "BACKGROUND");
    }

    const diagnostics = buildLiteralBgRoleMixDiagnostics({
      employees,
      states,
      taskSlots,
      allAssignments,
    } as never);

    for (const name of [
      "Angela Jiao",
      "Giulia Martins Cavalcante",
      "Nicole Pedicini",
    ]) {
      const diagnostic = diagnostics.find(
        (candidate) => candidate.employeeName === name,
      );

      assert.equal(diagnostic?.literalBgMissing, 1);
      assert.match(diagnostic?.swapConclusion ?? "", /Feasible swap found/);
    }
  });

  it("reports a specific blocker when excess BG cannot cover the displaced role", () => {
    const backgroundTask = bgTaskType();
    const clinicTask = {
      id: "clinic",
      code: "PROCEDURE",
      name: "Procedure",
      requiredSkillIds: ["procedure"],
      isBackground: false,
      isPatientFacing: true,
      isClinical: true,
      isSkilled: true,
      isEndoscopy: false,
      isFloat: false,
    };
    const missingEmployee = topOffEmployee({
      id: "giulia",
      fullName: "Giulia Martins Cavalcante",
      required: 3,
      assignedBg: 2,
      skillIds: ["procedure"],
    });
    const excessEmployee = topOffEmployee({
      id: "extra-bg",
      fullName: "Extra BG",
      required: 1,
      assignedBg: 2,
      skillIds: [],
    });
    const sourceSlot = topOffSlot({
      id: "giulia-procedure",
      date: "2026-07-09",
      shiftBlockId: "giulia-procedure-block",
      shiftName: "Giulia procedure",
      taskType: clinicTask,
      requirementLevel: "REQUIRED",
      requiredStaff: 1,
    });
    sourceSlot.assignments = [topOffAssignment(missingEmployee.id, "source")];
    sourceSlot.currentAssignmentCount = 1;
    const backgroundSlot = topOffSlot({
      id: "extra-bg-slot",
      date: "2026-07-09",
      shiftBlockId: "extra-bg-block",
      shiftName: "Extra BG",
      taskType: backgroundTask,
      requirementLevel: "DESIRED",
    });
    backgroundSlot.assignments = [topOffAssignment(excessEmployee.id, "bg")];
    backgroundSlot.currentAssignmentCount = 1;
    const employees = [missingEmployee, excessEmployee];
    const states = new Map<string, TestTopOffState>([
      [
        missingEmployee.id,
        { hours: 40, backgroundAssignments: 2, shiftKeys: new Set<string>() },
      ],
      [
        excessEmployee.id,
        { hours: 40, backgroundAssignments: 2, shiftKeys: new Set<string>() },
      ],
    ]);
    const taskSlots = [sourceSlot, backgroundSlot];
    const allAssignments = [
      existingFromTopOffSlot(sourceSlot, missingEmployee.id),
      existingFromTopOffSlot(backgroundSlot, excessEmployee.id),
      ...fillerAssignments(missingEmployee.id, "missing", 36),
      ...fillerAssignments(excessEmployee.id, "excess", 36),
    ];

    const candidate = selectLiteralBgSwapCandidate({
      missingEmployee,
      employees,
      states,
      taskSlots,
      allAssignments,
    } as never);
    const diagnostic = buildLiteralBgRoleMixDiagnostics({
      employees,
      states,
      taskSlots,
      allAssignments,
    } as never).find((item) => item.employeeId === missingEmployee.id);

    assert.equal(candidate, null);
    assert.match(
      diagnostic?.swapConclusion ?? "",
      /Impossible because .*Missing required skill/,
    );
  });

  it("does not convert Saturday Endoscopy to satisfy literal BG minimums", () => {
    const employee = {
      id: "giulia",
      fullName: "Giulia-like Employee",
      active: true,
      skillIds: [],
      availability: [{ weekday: 6, startMinute: 0, endMinute: 24 * 60 }],
      expectedHours: 40,
      requiredBackgroundAssignments: 3,
    };
    const backgroundTask = {
      id: "background",
      code: "BACKGROUND",
      name: "Background",
      requiredSkillIds: [],
      isBackground: true,
      isPatientFacing: false,
      isClinical: false,
      isSkilled: false,
      isEndoscopy: false,
      isFloat: false,
    };
    const endoscopyTask = {
      id: "endoscopy",
      code: "ENDOSCOPY",
      name: "Endoscopy",
      requiredSkillIds: [],
      isBackground: false,
      isPatientFacing: true,
      isClinical: true,
      isSkilled: true,
      isEndoscopy: true,
      isFloat: false,
    };
    const candidate = selectBackgroundMinimumConversionCandidate({
      employee,
      taskSlots: [
        {
          id: "sat-endo",
          date: "2026-07-11",
          scheduleDayId: "day",
          shiftBlockId: "sat-endo",
          shiftCategory: "ENDO",
          shiftName: "Saturday 0600-1400",
          paidHours: 8,
          taskTypeId: "endoscopy",
          slotIndex: 1,
          requirementLevel: "DESIRED",
          startMinute: 6 * 60,
          endMinute: 14 * 60,
          minStaff: 0,
          requiredStaff: 1,
          requiredSkillIds: [],
          eligibleEmployeeIds: [],
          taskType: endoscopyTask,
          source: "STAFFING_RULE",
          currentAssignmentCount: 1,
          assignments: [{ id: "endo-assignment", employeeId: "giulia", locked: false }],
        },
      ],
      shiftBlocks: [
        {
          id: "sat-endo",
          scheduleDayId: "day",
          date: "2026-07-11",
          name: "Saturday 0600-1400",
          shiftTemplateId: null,
          shiftCategory: "ENDO",
          startMinute: 6 * 60,
          endMinute: 14 * 60,
          paidHours: 8,
        },
      ],
      backgroundTask,
      allAssignments: [
        {
          slotId: "sat-endo",
          employeeId: "giulia",
          date: "2026-07-11",
          taskTypeId: "endoscopy",
          startMinute: 6 * 60,
          endMinute: 14 * 60,
          shiftBlockId: "sat-endo",
          shiftCategory: "ENDO",
          paidHours: 8,
          isPatientFacing: true,
          isClinical: true,
          isBackground: false,
          isEndoscopy: true,
        },
      ],
    } as never);

    assert.equal(candidate, null);
  });

  it("does not convert regular Saturday assignments to satisfy literal BG minimums", () => {
    const employee = {
      id: "saturday",
      fullName: "Saturday Employee",
      active: true,
      skillIds: [],
      availability: [{ weekday: 6, startMinute: 0, endMinute: 24 * 60 }],
      expectedHours: 40,
      requiredBackgroundAssignments: 3,
    };
    const backgroundTask = bgTaskType();
    const saturdayTask = {
      id: "pcp",
      code: "PCP",
      name: "PCP",
      requiredSkillIds: [],
      isBackground: false,
      isPatientFacing: true,
      isClinical: true,
      isSkilled: false,
      isEndoscopy: false,
      isFloat: false,
    };
    const candidate = selectBackgroundMinimumConversionCandidate({
      employee,
      taskSlots: [
        {
          id: "sat-regular",
          date: "2026-07-11",
          scheduleDayId: "day",
          shiftBlockId: "sat-regular",
          shiftCategory: "SATURDAY",
          shiftName: "Saturday 0800-1400",
          paidHours: 6,
          taskTypeId: "pcp",
          slotIndex: 1,
          requirementLevel: "DESIRED",
          startMinute: 8 * 60,
          endMinute: 14 * 60,
          minStaff: 0,
          requiredStaff: 1,
          requiredSkillIds: [],
          eligibleEmployeeIds: [],
          taskType: saturdayTask,
          source: "STAFFING_RULE",
          currentAssignmentCount: 1,
          assignments: [
            { id: "sat-assignment", employeeId: "saturday", locked: false },
          ],
        },
      ],
      shiftBlocks: [
        {
          id: "sat-regular",
          scheduleDayId: "day",
          date: "2026-07-11",
          name: "Saturday 0800-1400",
          shiftTemplateId: null,
          shiftCategory: "SATURDAY",
          startMinute: 8 * 60,
          endMinute: 14 * 60,
          paidHours: 6,
        },
      ],
      backgroundTask,
      allAssignments: [
        {
          slotId: "sat-regular",
          employeeId: "saturday",
          date: "2026-07-11",
          taskTypeId: "pcp",
          startMinute: 8 * 60,
          endMinute: 14 * 60,
          shiftBlockId: "sat-regular",
          shiftCategory: "SATURDAY",
          paidHours: 6,
          isPatientFacing: true,
          isClinical: true,
          isBackground: false,
          isEndoscopy: false,
        },
      ],
    } as never);

    assert.equal(candidate, null);
  });

  it("does not convert required clinic coverage to satisfy BG minimums", () => {
    const employee = {
      id: "giulia",
      fullName: "Giulia-like Employee",
      active: true,
      skillIds: [],
      availability: [{ weekday: 2, startMinute: 0, endMinute: 24 * 60 }],
      expectedHours: 40,
      requiredBackgroundAssignments: 3,
    };
    const backgroundTask = {
      id: "background",
      code: "BACKGROUND",
      name: "Background",
      requiredSkillIds: [],
      isBackground: true,
      isPatientFacing: false,
      isClinical: false,
      isSkilled: false,
      isEndoscopy: false,
      isFloat: false,
    };
    const clinicTask = {
      id: "allergy",
      code: "NEW_ALLERGY",
      name: "New Allergy",
      requiredSkillIds: [],
      isBackground: false,
      isPatientFacing: true,
      isClinical: true,
      isSkilled: false,
      isEndoscopy: false,
      isFloat: false,
    };
    const candidate = selectBackgroundMinimumConversionCandidate({
      employee,
      taskSlots: [
        {
          id: "required-allergy",
          date: "2026-07-07",
          scheduleDayId: "day",
          shiftBlockId: "am",
          shiftCategory: "AM",
          shiftName: "Tuesday 0800-1200",
          paidHours: 4,
          taskTypeId: "allergy",
          slotIndex: 1,
          requirementLevel: "REQUIRED",
          startMinute: 8 * 60,
          endMinute: 12 * 60,
          minStaff: 1,
          requiredStaff: 1,
          requiredSkillIds: [],
          eligibleEmployeeIds: [],
          taskType: clinicTask,
          source: "STAFFING_RULE",
          currentAssignmentCount: 1,
          assignments: [{ id: "allergy-assignment", employeeId: "giulia", locked: false }],
        },
      ],
      shiftBlocks: [
        {
          id: "am",
          scheduleDayId: "day",
          date: "2026-07-07",
          name: "Tuesday 0800-1200",
          shiftTemplateId: null,
          shiftCategory: "AM",
          startMinute: 8 * 60,
          endMinute: 12 * 60,
          paidHours: 4,
        },
      ],
      backgroundTask,
      allAssignments: [
        {
          slotId: "required-allergy",
          employeeId: "giulia",
          date: "2026-07-07",
          taskTypeId: "allergy",
          startMinute: 8 * 60,
          endMinute: 12 * 60,
          shiftBlockId: "am",
          shiftCategory: "AM",
          paidHours: 4,
          isPatientFacing: true,
          isClinical: true,
          isBackground: false,
        },
      ],
    } as never);

    assert.equal(candidate, null);
  });
});

describe("calendar exports", () => {
  const publishedCalendarDay = {
    date: monday,
    status: "PUBLISHED",
    scenario: "ROUTINE",
    taskSlots: [
      {
        id: "front-slot",
        label: "Front Desk #1",
        status: "FILLED",
        startMinute: 540,
        endMinute: 720,
        notes: "Front desk opens early.",
        taskType: {
          name: "Front Desk",
          code: "FRONT_DESK",
          isBackground: false,
        },
        shiftBlock: {
          name: "Monday 0900-1200",
          shiftCategory: "AM",
        },
        assignments: [
          {
            id: "assignment-alice-front",
            employeeId: "alice",
            source: "GENERATED",
            locked: false,
            employee: {
              fullName: "Alice Admin",
              email: "alice@example.com",
            },
          },
          {
            id: "assignment-blake-front",
            employeeId: "blake",
            source: "MANUAL_OVERRIDE",
            locked: true,
            employee: {
              fullName: "Blake Backup",
              email: "blake@example.com",
            },
          },
        ],
      },
    ],
  };
  const unpublishedCalendarDay = {
    date: "2026-06-02",
    status: "GENERATED",
    scenario: "ROUTINE",
    taskSlots: [
      {
        id: "civil-slot",
        label: "Civil Surgeon #1",
        status: "FILLED",
        startMinute: 540,
        endMinute: 720,
        notes: null,
        taskType: {
          name: "Civil Surgeon",
          code: "CIVIL_SURGEON",
          isBackground: true,
        },
        shiftBlock: {
          name: "Monday 0900-1200",
          shiftCategory: "AM",
        },
        assignments: [
          {
            id: "assignment-alice-civil",
            employeeId: "alice",
            source: "GENERATED",
            locked: false,
            employee: {
              fullName: "Alice Admin",
              email: "alice@example.com",
            },
          },
        ],
      },
    ],
  };

  it("exports only published schedule assignments", () => {
    const events = buildAssignmentCalendarEvents({
      scheduleDays: [unpublishedCalendarDay, publishedCalendarDay],
    });

    assert.equal(events.length, 2);
    assert.equal(
      events.some((event) => event.taskTypeName === "Civil Surgeon"),
      false,
    );
  });

  it("employee feeds only include that employee's assignments", () => {
    const events = buildAssignmentCalendarEvents({
      scheduleDays: [publishedCalendarDay],
      employeeId: "blake",
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].employeeName, "Blake Backup");
    assert.equal(events[0].assignmentId, "assignment-blake-front");
  });

  it("admin feeds include all published assignments", () => {
    const events = buildAssignmentCalendarEvents({
      scheduleDays: [publishedCalendarDay],
    });

    assert.deepEqual(
      events.map((event) => event.employeeName),
      ["Alice Admin", "Blake Backup"],
    );
  });

  it("can include drafts explicitly and labels clinic/background work", () => {
    const events = buildAssignmentCalendarEvents({
      scheduleDays: [publishedCalendarDay, unpublishedCalendarDay],
      includeStatuses: ["PUBLISHED", "GENERATED"],
    });

    assert.equal(events.length, 3);
    assert.equal(events[0].workCategory, "CLINIC");
    assert.equal(
      events.find((event) => event.taskTypeName === "Civil Surgeon")
        ?.workCategory,
      "BACKGROUND",
    );
  });

  it("renders standards-shaped ICS event data for published assignments", () => {
    const events = buildAssignmentCalendarEvents({
      scheduleDays: [publishedCalendarDay, unpublishedCalendarDay],
      employeeId: "alice",
    });
    const ics = buildIcsCalendar({
      calendarName: "Alice Published Assignments",
      events,
      generatedAt: new Date("2026-05-24T12:00:00.000Z"),
    });

    assert.equal(ics.includes("BEGIN:VCALENDAR"), true);
    assert.equal(ics.includes("VERSION:2.0"), true);
    assert.equal(ics.includes("BEGIN:VEVENT"), true);
    assert.equal(ics.includes("SUMMARY:Front Desk - Alice Admin"), true);
    assert.equal(ics.includes("DTSTART:20260601T090000Z"), true);
    assert.equal(ics.includes("DTEND:20260601T120000Z"), true);
    assert.equal(ics.includes("Employee: Alice Admin"), true);
    assert.equal(ics.includes("Task: Front Desk"), true);
    assert.equal(ics.includes("Work type: Clinic"), true);
    assert.equal(ics.includes("Shift: Monday 0900-1200"), true);
    assert.equal(ics.includes("CATEGORIES:CLINIC,Front Desk"), true);
    assert.equal(ics.includes("Civil Surgeon"), false);
  });

  it("returns week calendar downloads with the correct content type and filename", () => {
    const response = icsResponse({
      filename: "clinic-schedule-week-2026-08-03.ics",
      body: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
    });

    assert.equal(
      response.headers.get("Content-Type"),
      "text/calendar; charset=utf-8",
    );
    assert.equal(
      response.headers.get("Content-Disposition"),
      'attachment; filename="clinic-schedule-week-2026-08-03.ics"',
    );
  });

  it("returns month calendar downloads with the correct filename", () => {
    const response = icsResponse({
      filename: "clinic-schedule-month-2026-08.ics",
      body: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
    });

    assert.equal(
      response.headers.get("Content-Disposition"),
      'attachment; filename="clinic-schedule-month-2026-08.ics"',
    );
  });

  it("wires week and month ICS exports through the clinic calendar route", async () => {
    const [route, exportButton, weekBoard, monthCalendar] = await Promise.all([
      fs.readFile(
        path.join(
          process.cwd(),
          "src",
          "app",
          "api",
          "exports",
          "calendar",
          "clinic",
          "route.ts",
        ),
        "utf8",
      ),
      fs.readFile(
        path.join(
          process.cwd(),
          "src",
          "components",
          "schedule",
          "schedule-ics-export.tsx",
        ),
        "utf8",
      ),
      fs.readFile(
        path.join(
          process.cwd(),
          "src",
          "components",
          "schedule",
          "schedule-week-board.tsx",
        ),
        "utf8",
      ),
      fs.readFile(
        path.join(
          process.cwd(),
          "src",
          "components",
          "schedule",
          "schedule-calendar.tsx",
        ),
        "utf8",
      ),
    ]);

    assert.match(route, /clinic-schedule-week-\$\{input\.startDate\}\.ics/);
    assert.match(route, /clinic-schedule-month-\$\{input\.startDate\.slice\(0, 7\)\}\.ics/);
    assert.match(route, /draft-and-published/);
    assert.match(exportButton, /startDate/);
    assert.match(exportButton, /endDate/);
    assert.match(exportButton, /status/);
    assert.match(route, /No published assignments/);
    assert.match(weekBoard, /rangeLabel="week"/);
    assert.match(monthCalendar, /rangeLabel="month"/);
  });
});

describe("staffing analytics aggregation", () => {
  it("aggregates date, employee, and task health accurately", () => {
    const analytics = buildStaffingAnalytics({
      employees: [
        { id: "alice", fullName: "Alice Admin" },
        { id: "blake", fullName: "Blake Backup" },
      ],
      taskTypes: [
        {
          id: "front-desk",
          code: "FRONT_DESK",
          name: "Front Desk",
          difficultyWeight: 0,
          skillRequirementCount: 0,
        },
        {
          id: "civil-surgeon",
          code: "CIVIL_SURGEON",
          name: "Civil Surgeon",
          difficultyWeight: 3,
          skillRequirementCount: 1,
        },
      ],
      scheduleDays: [
        {
          id: "day-1",
          date: monday,
          scenario: "ROUTINE",
          status: "GENERATED",
          taskSlots: [
            {
              id: "front-slot",
              taskTypeId: "front-desk",
              status: "FILLED",
              requiredStaff: 1,
              shortNotice: false,
              taskType: {
                id: "front-desk",
                code: "FRONT_DESK",
                name: "Front Desk",
                difficultyWeight: 0,
                skillRequirementCount: 0,
              },
              assignments: [
                {
                  id: "assignment-1",
                  employeeId: "alice",
                  source: "MANUAL_OVERRIDE",
                  status: "ACTIVE",
                  shortNotice: true,
                  employee: { id: "alice", fullName: "Alice Admin" },
                },
              ],
            },
            {
              id: "civil-slot",
              taskTypeId: "civil-surgeon",
              status: "SHORTAGE",
              requiredStaff: 1,
              shortNotice: false,
              taskType: {
                id: "civil-surgeon",
                code: "CIVIL_SURGEON",
                name: "Civil Surgeon",
                difficultyWeight: 3,
                skillRequirementCount: 1,
              },
              assignments: [],
            },
          ],
        },
      ],
      ptoRequests: [
        {
          id: "pto-1",
          employeeId: "blake",
          status: "APPROVED",
          startDate: monday,
          endDate: monday,
          shortNotice: true,
          employee: { id: "blake", fullName: "Blake Backup" },
        },
      ],
    });

    assert.deepEqual(analytics.dateHealth[0], {
      date: monday,
      scenario: "ROUTINE",
      status: "GENERATED",
      requiredTaskSlots: 2,
      filledAssignments: 1,
      unfilledSlots: 1,
      ptoCount: 1,
      shortageConflictCount: 1,
      shortNoticeCount: 2,
    });
    assert.equal(analytics.employeeWorkloads[0].fullName, "Alice Admin");
    assert.equal(analytics.employeeWorkloads[0].assignmentCount, 1);
    assert.equal(analytics.employeeWorkloads[1].ptoCount, 1);
    assert.equal(analytics.taskTypeStats[0].taskTypeName, "Civil Surgeon");
    assert.equal(analytics.taskTypeStats[0].understaffedCount, 1);
    assert.equal(
      analytics.taskTypeStats.find((task) => task.taskTypeName === "Front Desk")
        ?.overrideCount,
      1,
    );
    assert.equal(
      analytics.roleLeaders.find((leader) => leader.taskTypeName === "Front Desk")
        ?.fullName,
      "Alice Admin",
    );
  });
});

describe("automated scheduling workflow foundations", () => {
  it("defines shared Front plus distinct IT, prior authorization, and Research skills", () => {
    const skillCodes: string[] = REQUIRED_CONFIGURABLE_SKILLS.map(
      (skill) => skill.code,
    );

    assert.deepEqual(
      skillCodes,
      ["FRONT", "IT", "PRIOR_AUTHORIZATION", "RESEARCH"],
    );
    assert.equal(skillCodes.includes("FRONT_BG"), false);
    assert.equal(skillCodes.includes("FRONT_BACKGROUND"), false);
    assert.deepEqual(REQUIRED_TASK_SKILL_CODES.FRONT_DESK, ["FRONT"]);
    assert.deepEqual(REQUIRED_TASK_SKILL_CODES.FRONT_BACKGROUND, ["FRONT"]);
    assert.equal(
      (Object.values(REQUIRED_TASK_SKILL_CODES).flat() as string[])
        .some(
          (skillCode) =>
            skillCode === "FRONT_BG" || skillCode === "FRONT_BACKGROUND",
        ),
      false,
    );
    assert.deepEqual(REQUIRED_TASK_SKILL_CODES.PRIOR_AUTHORIZATION, [
      "PRIOR_AUTHORIZATION",
    ]);
  });

  it("does not seed Front BG as an employee skill", async () => {
    const seed = await fs.readFile(
      path.join(process.cwd(), "prisma", "seed.ts"),
      "utf8",
    );
    const skillsBlock = seed.slice(
      seed.indexOf("const skills = ["),
      seed.indexOf("const taskTypes = ["),
    );

    assert.equal(skillsBlock.includes("FRONT_BACKGROUND"), false);
    assert.equal(skillsBlock.includes("FRONT_BG"), false);
  });

  it("migrates legacy Front BG skill references into Front", async () => {
    const migration = await fs.readFile(
      path.join(
        process.cwd(),
        "prisma",
        "migrations",
        "202606160003_merge_front_bg_skill",
        "migration.sql",
      ),
      "utf8",
    );

    assert.match(migration, /INSERT INTO "Skill"[\s\S]*'FRONT'/);
    assert.match(
      migration,
      /INSERT INTO "EmployeeSkill"[\s\S]*legacy_employee_skills/,
    );
    assert.match(
      migration,
      /INSERT INTO "TaskSkillRequirement"[\s\S]*legacy_task_requirements/,
    );
    assert.match(
      migration,
      /DELETE FROM "TaskSkillRequirement"[\s\S]*legacy_skills/,
    );
    assert.match(migration, /DELETE FROM "EmployeeSkill"[\s\S]*legacy_skills/);
    assert.match(migration, /DELETE FROM "Skill"[\s\S]*'FRONT_BACKGROUND'/);
  });

  it("preserves manual skill assignments while adding imported Easton skills", () => {
    assert.deepEqual(
      mergeImportedEmployeeSkillCodes(
        ["CIVIL_SURGEON", "RESEARCH"],
        ["FRONT"],
      ),
      ["CIVIL_SURGEON", "FRONT", "RESEARCH"],
    );
    assert.deepEqual(
      mergeImportedEmployeeSkillCodes(["FRONT", "IT"], ["FRONT"]),
      ["FRONT", "IT"],
    );
  });

  it("parses required weekly BG shifts from the employee form", () => {
    const parsed = employeeFormSchema.parse({
      fullName: "Test Employee",
      email: "test@example.com",
      authProviderId: "",
      role: "EMPLOYEE",
      status: "ACTIVE",
      ptoBalanceHours: "0",
      optoBalanceHours: "-2",
      optoBalanceOriginal: "-2",
      expectedWeeklyHours: "40",
      requiredWeeklyBackgroundShifts: "3",
      weeklyAssignmentLimit: "",
      workPatternId: "",
      startDate: "2026-07-01",
      endDate: "",
      skillIds: [],
      availability: [],
    });

    assert.equal(parsed.requiredWeeklyBackgroundShifts, 3);
    assert.equal(parsed.optoBalanceHours, -2);
  });

  for (const [taskCode, skillCode] of [
    ["IT", "IT"],
    ["PRIOR_AUTHORIZATION", "PRIOR_AUTHORIZATION"],
    ["RESEARCH", "RESEARCH"],
  ] as const) {
    it(`enforces the ${taskCode} skill during generation`, () => {
      const result = generateSchedule({
        seed: `skill-${taskCode}`,
        employees: [
          {
            id: "unskilled",
            fullName: "Unskilled",
            skillIds: [],
            availability: allDayMonday,
          },
          {
            id: "skilled",
            fullName: "Skilled",
            skillIds: [skillCode],
            availability: allDayMonday,
          },
        ],
        taskTypes: [
          {
            id: taskCode,
            code: taskCode,
            name: taskCode,
            requiredSkillIds: [skillCode],
            isPatientFacing: taskCode === "IT",
            isClinical: taskCode === "IT",
            isBackground: taskCode !== "IT",
          },
        ],
        slots: [
          {
            id: `${taskCode}-slot`,
            date: monday,
            taskTypeId: taskCode,
            slotIndex: 1,
            startMinute: 480,
            endMinute: 720,
            requirementLevel: "OPTIONAL",
          },
        ],
      });

      assert.equal(result.assignments[0].employeeId, "skilled");
    });
  }

  it("uses one FRONT skill for separate Front Desk and Front Background task types", () => {
    const frontDesk = {
      id: "front-desk",
      code: "FRONT_DESK",
      name: "Front Desk",
      requiredSkillIds: ["FRONT"],
      isPatientFacing: true,
      isClinical: false,
      isBackground: false,
    };
    const frontBackground = {
      id: "front-background",
      code: "FRONT_BACKGROUND",
      name: "Front Background",
      requiredSkillIds: ["FRONT"],
      isPatientFacing: false,
      isClinical: false,
      isBackground: true,
    };
    const taskTypes = [frontDesk, frontBackground];
    const slots = [
      {
        id: "front-desk-slot",
        date: monday,
        taskTypeId: frontDesk.id,
        slotIndex: 1,
        startMinute: 8 * 60,
        endMinute: 12 * 60,
        requirementLevel: "REQUIRED" as const,
      },
      {
        id: "front-background-slot",
        date: monday,
        taskTypeId: frontBackground.id,
        slotIndex: 1,
        startMinute: 13 * 60,
        endMinute: 17 * 60,
        requirementLevel: "DESIRED" as const,
      },
    ];

    const result = generateSchedule({
      seed: "front-shared-skill",
      employees: [
        {
          id: "unskilled",
          fullName: "Unskilled",
          skillIds: [],
          availability: allDayMonday,
        },
        {
          id: "front-skilled",
          fullName: "Front Skilled",
          skillIds: ["FRONT"],
          availability: allDayMonday,
        },
      ],
      taskTypes,
      slots,
    });

    assert.deepEqual(
      result.assignments
        .map((assignment) => [
          assignment.slotId,
          assignment.taskTypeId,
          assignment.employeeId,
        ])
        .sort((left, right) => left[0].localeCompare(right[0])),
      [
        ["front-background-slot", "front-background", "front-skilled"],
        ["front-desk-slot", "front-desk", "front-skilled"],
      ],
    );
    assert.deepEqual(
      taskTypes.map((taskType) => taskType.code),
      ["FRONT_DESK", "FRONT_BACKGROUND"],
    );

    const noFrontSkill = generateSchedule({
      seed: "front-shared-skill-missing",
      employees: [
        {
          id: "unskilled",
          fullName: "Unskilled",
          skillIds: [],
          availability: allDayMonday,
        },
      ],
      taskTypes,
      slots,
    });

    assert.equal(noFrontSkill.assignments.length, 0);
    assert.deepEqual(
      noFrontSkill.conflicts.map((conflict) => conflict.slotId),
      ["front-desk-slot", "front-background-slot"],
    );
    assert.equal(
      noFrontSkill.conflicts.every((conflict) =>
        conflict.rejectedCandidates.some((candidate) =>
          candidate.reasons.includes("Missing required skill"),
        ),
      ),
      true,
    );
  });

  it("plans deterministic week and month ranges and skips published dates", () => {
    assert.deepEqual(clinicWeekRange("2026-06-04"), {
      startDate: "2026-06-01",
      endDate: "2026-06-06",
    });
    assert.deepEqual(resolveScheduleRange({ mode: "MONTH", date: "2026-06-04" }), {
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    });
    assert.deepEqual(
      planScheduleRange({
        startDate: "2026-06-01",
        endDate: "2026-06-03",
        publishedDates: ["2026-06-02"],
      }).map((item) => [item.date, item.action]),
      [
        ["2026-06-01", "GENERATE"],
        ["2026-06-02", "SKIP_PUBLISHED"],
        ["2026-06-03", "GENERATE"],
      ],
    );
  });

  it("labels partial generation when published days are skipped", async () => {
    const plan = planScheduleGeneration({
      startDate: "2026-08-03",
      endDate: "2026-08-08",
      publishedDates: ["2026-08-05"],
    });
    const actions = await fs.readFile(
      path.join(process.cwd(), "src", "app", "(app)", "schedule", "actions.ts"),
      "utf8",
    );

    assert.deepEqual(plan.publishedDatesSkipped, ["2026-08-05"]);
    assert.deepEqual(
      partialGenerationWeekStarts({
        weeks: plan.weeks,
        publishedDatesSkipped: plan.publishedDatesSkipped,
      }),
      ["2026-08-03"],
    );
    assert.match(
      PUBLISHED_DAYS_PARTIAL_GENERATION_WARNING,
      /Recommended: Unpublish, clear, and regenerate full week\./,
    );
    assert.match(actions, /stayed published and was skipped/);
    assert.match(actions, /Weekly validation may be incomplete or stale/);
  });

  it("wires month actions to shared week generation with safe clear and progress UI", async () => {
    const [workflow, actions, monthActions] = await Promise.all([
      fs.readFile(
        path.join(process.cwd(), "src", "lib", "db", "schedule-workflows.ts"),
        "utf8",
      ),
      fs.readFile(
        path.join(
          process.cwd(),
          "src",
          "app",
          "(app)",
          "schedule",
          "actions.ts",
        ),
        "utf8",
      ),
      fs.readFile(
        path.join(
          process.cwd(),
          "src",
          "components",
          "schedule",
          "month-schedule-actions.tsx",
        ),
        "utf8",
      ),
    ]);

    assert.match(workflow, /for \(const week of generationWeeks\)/);
    assert.ok(
      workflow.indexOf("for (const date of saturdayDates)") <
        workflow.indexOf("for (const date of nonSaturdayDates)"),
    );
    assert.match(
      workflow,
      /locked:\s*false[\s\S]*AssignmentSource\.GENERATED/,
    );
    assert.match(
      workflow,
      /source:\s*AssignmentSource\.MANUAL_OVERRIDE/,
    );
    assert.match(
      workflow,
      /regenerateFullScheduleRange[\s\S]*unpublishScheduleRange[\s\S]*clearGeneratedScheduleRange[\s\S]*generateScheduleRange/,
    );
    assert.match(
      workflow,
      /validationStatus === "PARTIAL"[\s\S]*employeesUnderTarget/,
    );
    assert.match(actions, /scheduleMonthAction[\s\S]*requireManager\(\)/);
    assert.match(actions, /PARTIAL_GENERATE/);
    assert.match(actions, /regenerateFullScheduleRange/);
    assert.match(actions, /confirmClearPublished/);
    assert.match(monthActions, /Generating month…/);
    assert.match(monthActions, /Running partial generation…/);
    assert.match(monthActions, /Rebuilding full month…/);
    assert.match(monthActions, /Publishing month…/);
    assert.match(monthActions, /Unpublishing month…/);
    assert.match(monthActions, /Clearing generated month…/);
    assert.match(
      monthActions,
      /Assignments were preserved|Assignments will be preserved/,
    );
  });

  it("uses Current Easton wording for user-facing scheduling model copy", async () => {
    const files = await Promise.all(
      [
        path.join(
          process.cwd(),
          "src",
          "components",
          "schedule",
          "schedule-week-board.tsx",
        ),
        path.join(process.cwd(), "src", "lib", "schedule", "hard-requirements.ts"),
        path.join(process.cwd(), "src", "lib", "easton-import", "work-patterns.ts"),
        path.join(process.cwd(), "src", "lib", "easton-import", "parser.ts"),
        path.join(
          process.cwd(),
          "src",
          "app",
          "(app)",
          "admin",
          "easton-import",
          "page.tsx",
        ),
      ].map((filePath) => fs.readFile(filePath, "utf8")),
    );
    const text = files.join("\n");

    assert.match(text, /Current Easton requirements are unmet/);
    assert.match(text, /Current Easton patient shifts/);
    assert.match(text, /Current Easton role targets/);
    assert.match(text, /Current Easton scheduling model/);
    assert.doesNotMatch(
      text,
      /July hard requirements|July patient shifts|July role targets|July model/,
    );
  });

  it("creates canonical weekly, biweekly, and monthly background periods", () => {
    assert.deepEqual(
      enumerateBackgroundPeriods({
        startDate: "2026-06-01",
        endDate: "2026-06-14",
        definition: { periodType: "WEEKLY" },
      }),
      [
        { startDate: "2026-06-01", endDate: "2026-06-07" },
        { startDate: "2026-06-08", endDate: "2026-06-14" },
      ],
    );
    assert.equal(
      enumerateBackgroundPeriods({
        startDate: "2026-06-01",
        endDate: "2026-06-14",
        definition: { periodType: "BIWEEKLY" },
      }).length,
      2,
    );
    assert.deepEqual(
      enumerateBackgroundPeriods({
        startDate: "2026-06-10",
        endDate: "2026-06-20",
        definition: { periodType: "MONTHLY" },
      }),
      [{ startDate: "2026-06-01", endDate: "2026-06-30" }],
    );
    assert.equal(
      backgroundSlotCount({
        requiredCountPerPeriod: 3,
        estimatedHoursPerPeriod: 30,
        paidHoursPerSlot: 4,
      }),
      3,
    );
    assert.equal(
      backgroundSlotCount({
        requiredCountPerPeriod: null,
        estimatedHoursPerPeriod: 10,
        paidHoursPerSlot: 4,
      }),
      3,
    );
  });

  it("fills required clinic coverage before generated background work", () => {
    const result = generateSchedule({
      seed: "clinic-before-background",
      employees: [
        {
          id: "one-person",
          fullName: "One Person",
          skillIds: [],
          availability: allDayMonday,
        },
      ],
      taskTypes: [
        {
          id: "clinic",
          code: "CLINIC",
          name: "Clinic",
          requiredSkillIds: [],
          isClinical: true,
        },
        {
          id: "background",
          code: "BACKGROUND",
          name: "Background",
          requiredSkillIds: [],
          isBackground: true,
        },
      ],
      slots: [
        {
          id: "background-slot",
          date: monday,
          taskTypeId: "background",
          slotIndex: 1,
          requirementLevel: "OPTIONAL",
          startMinute: 480,
          endMinute: 720,
        },
        {
          id: "clinic-slot",
          date: monday,
          taskTypeId: "clinic",
          slotIndex: 1,
          requirementLevel: "REQUIRED",
          startMinute: 480,
          endMinute: 720,
        },
      ],
    });

    assert.equal(result.assignments[0].slotId, "clinic-slot");
    assert.equal(
      result.assignments.some((assignment) => assignment.slotId === "background-slot"),
      false,
    );
  });

  it("assigns generated background work after clinic coverage when staff remain", () => {
    const result = generateSchedule({
      seed: "clinic-then-background",
      employees: [
        {
          id: "clinic-person",
          fullName: "Clinic Person",
          skillIds: [],
          availability: allDayMonday,
        },
        {
          id: "background-person",
          fullName: "Background Person",
          skillIds: [],
          availability: allDayMonday,
        },
      ],
      taskTypes: [
        {
          id: "clinic",
          code: "CLINIC",
          name: "Clinic",
          requiredSkillIds: [],
          isPatientFacing: true,
          isClinical: true,
        },
        {
          id: "background",
          code: "BACKGROUND",
          name: "Background",
          requiredSkillIds: [],
          isBackground: true,
        },
      ],
      slots: [
        {
          id: "background-slot",
          date: monday,
          taskTypeId: "background",
          slotIndex: 1,
          requirementLevel: "OPTIONAL",
          startMinute: 480,
          endMinute: 720,
        },
        {
          id: "clinic-slot",
          date: monday,
          taskTypeId: "clinic",
          slotIndex: 1,
          requirementLevel: "REQUIRED",
          startMinute: 480,
          endMinute: 720,
        },
      ],
    });

    assert.equal(result.conflicts.length, 0);
    assert.equal(result.assignments.length, 2);
    assert.equal(result.assignments.some((item) => item.slotId === "background-slot"), true);
  });

  it("preloads protected background assignments before filling clinic coverage", () => {
    const result = generateSchedule({
      seed: "protected-background",
      employees: [
        {
          id: "protected-owner",
          fullName: "Protected Owner",
          skillIds: [],
          availability: allDayMonday,
        },
      ],
      taskTypes: [
        {
          id: "clinic",
          code: "CLINIC",
          name: "Clinic",
          requiredSkillIds: [],
          isClinical: true,
        },
        {
          id: "background",
          code: "BACKGROUND",
          name: "Background",
          requiredSkillIds: [],
          isBackground: true,
        },
      ],
      slots: [
        {
          id: "clinic-slot",
          date: monday,
          taskTypeId: "clinic",
          slotIndex: 1,
          requirementLevel: "REQUIRED",
          startMinute: 480,
          endMinute: 720,
        },
        {
          id: "protected-background-slot",
          date: monday,
          taskTypeId: "background",
          slotIndex: 1,
          requirementLevel: "OPTIONAL",
          startMinute: 480,
          endMinute: 720,
          lockedEmployeeIds: ["protected-owner"],
        },
      ],
    });

    assert.equal(
      result.assignments.some((assignment) => assignment.slotId === "clinic-slot"),
      false,
    );
    assert.equal(result.conflicts[0].slotId, "clinic-slot");
  });

  it("warns before skill and PTO violating manual reassignment", () => {
    const warnings = validateManualAssignment({
      employee: {
        id: "employee",
        fullName: "Employee",
        skillIds: [],
        availability: allDayMonday,
        unavailable: [{ startDate: monday, endDate: monday }],
      },
      taskType: {
        id: "it",
        code: "IT",
        name: "IT",
        requiredSkillIds: ["IT"],
      },
      slot: {
        id: "it-slot",
        date: monday,
        taskTypeId: "it",
        slotIndex: 1,
        startMinute: 480,
        endMinute: 720,
      },
      assignments: [],
    });

    assert.equal(warnings.some((warning) => warning.code === "MISSING_SKILL"), true);
    assert.equal(warnings.some((warning) => warning.code === "PTO_NPTO"), true);
  });

  it("whole-day view data keeps every shift block and week health aggregates status", () => {
    const groups = buildWholeDayShiftGroups({
      shiftBlocks: [{ id: "am" }, { id: "pm" }, { id: "empty" }],
      taskSlots: [
        { id: "am-slot", shiftBlockId: "am" },
        { id: "pm-slot", shiftBlockId: "pm" },
      ],
    });

    assert.deepEqual(
      groups.map((group) => [group.shiftBlock.id, group.slots.length]),
      [
        ["am", 1],
        ["pm", 1],
        ["empty", 0],
      ],
    );
    assert.deepEqual(
      buildWeekDayHealth({
        status: "GENERATED",
        ptoCount: 2,
        nptoCount: 1,
        slots: [
          {
            status: "FILLED",
            requirementLevel: "REQUIRED",
            requiredStaff: 1,
            assignmentCount: 1,
          },
          {
            status: "SHORTAGE",
            requirementLevel: "REQUIRED",
            requiredStaff: 1,
            assignmentCount: 0,
          },
        ],
      }),
      {
        status: "GENERATED",
        taskSlotCount: 2,
        assignmentCount: 1,
        filledClinicSlotCount: 1,
        unfilledClinicSlotCount: 1,
        backgroundSlotCount: 0,
        shortageCount: 1,
        unfilledRequiredCount: 1,
        ptoCount: 2,
        nptoCount: 1,
      },
    );
  });

  it("builds a weekly employee grid with AM and PM roles and exposure totals", () => {
    const rows = buildWeekStaffSummary({
      employees: [{ id: "employee", fullName: "Employee", targetHours: 40 }],
      assignments: [
        {
          employeeId: "employee",
          date: monday,
          shiftBlockId: "am",
          shiftName: "AM",
          shiftCategory: "AM",
          startMinute: 480,
          endMinute: 720,
          paidHours: 4,
          taskTypeCode: "NEW_GI",
          taskTypeName: "New GI",
          isPatientFacing: true,
          isBackground: false,
          isEndoscopy: false,
          locked: false,
        },
        {
          employeeId: "employee",
          date: monday,
          shiftBlockId: "pm",
          shiftName: "PM",
          shiftCategory: "PM",
          startMinute: 780,
          endMinute: 1020,
          paidHours: 4,
          taskTypeCode: "RESEARCH",
          taskTypeName: "Research",
          isPatientFacing: false,
          isBackground: true,
          isEndoscopy: false,
          locked: false,
        },
      ],
    });

    assert.equal(rows[0].assignmentsByDate[monday].length, 2);
    assert.equal(rows[0].totalHours, 8);
    assert.equal(rows[0].patientFacingShiftCount, 1);
    assert.equal(rows[0].backgroundShiftCount, 1);
    assert.equal(rows[0].exposure.GI, 1);
  });

  it("counts Current Easton patient shifts only from GI, Allergy, and PCP roles", () => {
    assert.equal(julyPatientShiftGroupFromTaskCode("NEW_GI"), "GI");
    assert.equal(julyPatientShiftGroupFromTaskCode("VIRTUAL_GI"), "GI");
    assert.equal(julyPatientShiftGroupFromTaskCode("GI"), "GI");
    assert.equal(julyPatientShiftGroupFromTaskCode("NEW_ALLERGY"), "ALLERGY");
    assert.equal(julyPatientShiftGroupFromTaskCode("VIRTUAL_ALLERGY"), "ALLERGY");
    assert.equal(julyPatientShiftGroupFromTaskCode("ALLERGY"), "ALLERGY");
    assert.equal(julyPatientShiftGroupFromTaskCode("PCP"), "PCP");

    for (const code of [
      "PROCEDURE",
      "CIVIL_SURGEON",
      "FRONT_DESK",
      "FRONT_BACKGROUND",
      "ENDOSCOPY",
      "ALLERGY_SHOTS",
      "BOOKING",
      "RESEARCH",
      "FLOAT",
      "BACKGROUND",
      "PRIOR_AUTHORIZATION",
      "FOLLOWUP",
    ]) {
      assert.equal(isJulyPatientShiftTaskCode(code), false, code);
    }
  });

  it("keeps patient shifts equal to GI plus Allergy plus PCP in week totals", () => {
    const assignment = (
      taskTypeCode: string,
      taskTypeName: string,
      index: number,
      isBackground = false,
    ) => ({
      employeeId: "alice",
      date: `2026-07-${String(6 + index).padStart(2, "0")}`,
      shiftBlockId: `shift-${index}`,
      shiftName: `Shift ${index}`,
      shiftCategory: "AM",
      startMinute: 8 * 60,
      endMinute: 12 * 60,
      paidHours: 4,
      taskTypeCode,
      taskTypeName,
      isPatientFacing: true,
      isBackground,
      isEndoscopy: taskTypeCode === "ENDOSCOPY",
      locked: false,
    });
    const rows = buildWeekStaffSummary({
      employees: [{ id: "alice", fullName: "Alice Huang", targetHours: 40 }],
      assignments: [
        assignment("PROCEDURE", "Procedure", 0),
        assignment("BACKGROUND", "Background", 1, true),
        assignment("PCP", "PCP", 2),
        assignment("BACKGROUND", "Background", 3, true),
        assignment("NEW_GI", "New GI", 4),
        assignment("BACKGROUND", "Background", 5, true),
        assignment("PCP", "PCP", 6),
        assignment("BACKGROUND", "Background", 7, true),
        assignment("NEW_ALLERGY", "New Allergy", 8),
      ],
    });
    const row = rows[0];

    assert.deepEqual(row.exposure, { GI: 1, ALLERGY: 1, PCP: 2 });
    assert.equal(row.patientFacingShiftCount, 4);
    assert.equal(
      row.patientFacingShiftCount,
      row.exposure.GI + row.exposure.ALLERGY + row.exposure.PCP,
    );
    assert.equal(row.roleCounts.PROCEDURE, 1);
  });

  it("flags employees below two or above five strict Current Easton patient shifts", () => {
    const targets = [
      patientFairnessTarget("below", "Below Employee"),
      patientFairnessTarget("above", "Above Employee"),
    ];
    const assignments = [
      patientFairnessAssignment("below", "NEW_GI", 0),
      ...Array.from({ length: 6 }, (_, index) =>
        patientFairnessAssignment(
          "above",
          index % 3 === 0
            ? "NEW_GI"
            : index % 3 === 1
              ? "NEW_ALLERGY"
              : "PCP",
          index + 1,
        ),
      ),
    ];
    const result = evaluateWeeklyHardRequirements({ targets, assignments });

    assert.equal(JULY_PATIENT_SHIFT_MINIMUM, 2);
    assert.equal(JULY_PATIENT_SHIFT_MAXIMUM, 5);
    assert.equal(result.patientSummary.belowMinimum, 1);
    assert.equal(result.patientSummary.aboveMaximum, 1);
    assert.ok(
      result.issues.some(
        (issue) =>
          issue.employeeId === "below" &&
          issue.code === "PATIENT_SHIFT_MINIMUM_UNMET",
      ),
    );
    assert.ok(
      result.issues.some(
        (issue) =>
          issue.employeeId === "above" &&
          issue.code === "PATIENT_SHIFT_MAXIMUM_EXCEEDED",
      ),
    );
  });

  it("keeps missing GI Allergy PCP diversity as a soft warning", () => {
    const result = evaluateWeeklyHardRequirements({
      targets: [
        {
          ...patientFairnessTarget("employee", "Employee"),
          expectedWeeklyHours: 12,
        },
      ],
      assignments: [
        patientFairnessAssignment("employee", "NEW_GI", 0),
        patientFairnessAssignment("employee", "NEW_GI", 1),
        patientFairnessAssignment("employee", "PCP", 2),
      ],
    });

    assert.equal(result.patientRangeIssues.length, 0);
    assert.equal(result.canPublish, true);
    assert.deepEqual(
      result.patientDiversityWarnings[0]?.missingExposureGroups,
      ["ALLERGY"],
    );
  });

  it("strongly favors an employee below the patient minimum over one at the maximum", () => {
    const result = generateSchedule({
      seed: "patient-range-priority",
      employees: [
        {
          ...baseEmployee("below", "Below"),
          scheduledPatientFacingAssignmentsThisWeek: 1,
        },
        {
          ...baseEmployee("maximum", "Maximum"),
          scheduledPatientFacingAssignmentsThisWeek: 5,
        },
      ],
      taskTypes: [
        {
          id: "gi",
          code: "NEW_GI",
          name: "New GI",
          requiredSkillIds: [],
          isClinical: true,
          exposureGroup: "GI",
        },
      ],
      slots: [
        {
          ...defaultSlot,
          id: "gi-slot",
          taskTypeId: "gi",
        },
      ],
    });

    assert.equal(result.assignments[0]?.employeeId, "below");
  });

  it("uses weekly GI Allergy PCP exposure when choosing a diversity assignment", () => {
    const result = generateSchedule({
      seed: "patient-diversity-priority",
      employees: [
        {
          ...baseEmployee("missing-allergy", "Missing Allergy"),
          scheduledPatientFacingAssignmentsThisWeek: 2,
          scheduledExposureAssignmentsThisWeek: { GI: 1, PCP: 1 },
          exposureGoals: ["GI", "ALLERGY", "PCP"],
        },
        {
          ...baseEmployee("has-allergy", "Has Allergy"),
          scheduledPatientFacingAssignmentsThisWeek: 2,
          scheduledExposureAssignmentsThisWeek: {
            GI: 1,
            ALLERGY: 1,
          },
          exposureGoals: ["GI", "ALLERGY", "PCP"],
        },
      ],
      taskTypes: [
        {
          id: "allergy",
          code: "NEW_ALLERGY",
          name: "New Allergy",
          requiredSkillIds: [],
          isClinical: true,
          exposureGroup: "ALLERGY",
        },
      ],
      slots: [
        {
          ...defaultSlot,
          id: "allergy-slot",
          taskTypeId: "allergy",
        },
      ],
    });

    assert.equal(result.assignments[0]?.employeeId, "missing-allergy");
  });

  it("repairs a below-minimum employee without unstaffing either role", () => {
    const recipient = patientRepairEmployee("recipient", "Recipient");
    const donor = patientRepairEmployee("donor", "Donor");
    const slots = [
      patientRepairSlot({
        id: "recipient-existing-patient",
        date: "2026-07-06",
        taskTypeCode: "NEW_GI",
        employeeId: recipient.id,
      }),
      patientRepairSlot({
        id: "support",
        date: "2026-07-07",
        taskTypeCode: "RESEARCH",
        employeeId: recipient.id,
        isBackground: true,
      }),
      patientRepairSlot({
        id: "gi",
        date: "2026-07-08",
        taskTypeCode: "NEW_GI",
        employeeId: donor.id,
      }),
      patientRepairSlot({
        id: "allergy",
        date: "2026-07-09",
        taskTypeCode: "NEW_ALLERGY",
        employeeId: donor.id,
      }),
      patientRepairSlot({
        id: "pcp",
        date: "2026-07-10",
        taskTypeCode: "PCP",
        employeeId: donor.id,
      }),
    ];
    const allAssignments = patientRepairExistingAssignments(slots);
    const result = selectPatientRangeSwapCandidate({
      recipientEmployee: recipient,
      employees: [recipient, donor],
      slots,
      allAssignments,
      movableDateSet: new Set(slots.map((slot) => slot.date)),
      mode: "BELOW_MINIMUM",
    });

    assert.ok(result.candidate);
    assert.equal(result.candidate.recipientSourceSlot.id, "support");
    assert.ok(
      ["gi", "allergy", "pcp"].includes(
        result.candidate.donorPatientSlot.id,
      ),
    );
    assert.equal(result.candidate.recipientSourceSlot.assignments.length, 1);
    assert.equal(result.candidate.donorPatientSlot.assignments.length, 1);
    applyPatientAssignmentSwapInMemory({
      swap: {
        firstEmployee: result.candidate.recipientEmployee,
        firstAssignment: result.candidate.recipientAssignment,
        firstSlot: result.candidate.recipientSourceSlot,
        secondEmployee: result.candidate.donorEmployee,
        secondAssignment: result.candidate.donorAssignment,
        secondSlot: result.candidate.donorPatientSlot,
      },
      assignments: allAssignments,
    });
    const diagnostics = buildPatientDiagnosticMap(
      [recipient, donor],
      slots,
    );

    assert.equal(diagnostics.get(recipient.id)?.patientShiftCount, 2);
    assert.equal(diagnostics.get(donor.id)?.patientShiftCount, 2);
    assert.ok(slots.every((slot) => slot.assignments.length === 1));
  });

  it("repairs an above-maximum donor toward an employee with room", () => {
    const recipient = patientRepairEmployee("recipient", "Recipient");
    const donor = patientRepairEmployee("donor", "Donor");
    const slots = [
      patientRepairSlot({
        id: "recipient-support",
        date: "2026-07-06",
        taskTypeCode: "RESEARCH",
        employeeId: recipient.id,
        isBackground: true,
      }),
      ...Array.from({ length: 4 }, (_, index) =>
        patientRepairSlot({
          id: `recipient-patient-${index}`,
          date: `2026-07-${String(7 + index).padStart(2, "0")}`,
          taskTypeCode:
            index % 3 === 0
              ? "NEW_GI"
              : index % 3 === 1
                ? "NEW_ALLERGY"
                : "PCP",
          employeeId: recipient.id,
          startMinute: index >= 3 ? 13 * 60 : 8 * 60,
          endMinute: index >= 3 ? 17 * 60 : 12 * 60,
        }),
      ),
      ...Array.from({ length: 6 }, (_, index) =>
        patientRepairSlot({
          id: `donor-patient-${index}`,
          date: `2026-07-${String(6 + index).padStart(2, "0")}`,
          taskTypeCode:
            index % 3 === 0
              ? "NEW_GI"
              : index % 3 === 1
                ? "NEW_ALLERGY"
                : "PCP",
          employeeId: donor.id,
          startMinute: index >= 5 ? 13 * 60 : 8 * 60,
          endMinute: index >= 5 ? 17 * 60 : 12 * 60,
        }),
      ),
    ];
    const allAssignments = patientRepairExistingAssignments(slots);
    const result = selectPatientRangeSwapCandidate({
      donorEmployee: donor,
      employees: [recipient, donor],
      slots,
      allAssignments,
      movableDateSet: new Set(slots.map((slot) => slot.date)),
      mode: "ABOVE_MAXIMUM",
    });

    assert.ok(result.candidate);
    assert.equal(result.candidate.donorEmployee.id, donor.id);
    assert.equal(result.candidate.recipientEmployee.id, recipient.id);
    applyPatientAssignmentSwapInMemory({
      swap: {
        firstEmployee: result.candidate.recipientEmployee,
        firstAssignment: result.candidate.recipientAssignment,
        firstSlot: result.candidate.recipientSourceSlot,
        secondEmployee: result.candidate.donorEmployee,
        secondAssignment: result.candidate.donorAssignment,
        secondSlot: result.candidate.donorPatientSlot,
      },
      assignments: allAssignments,
    });
    const diagnostics = buildPatientDiagnosticMap(
      [recipient, donor],
      slots,
    );

    assert.equal(diagnostics.get(recipient.id)?.patientShiftCount, 5);
    assert.equal(diagnostics.get(donor.id)?.patientShiftCount, 5);
    assert.ok(slots.every((slot) => slot.assignments.length === 1));
  });

  it("does not break literal BG minimums to repair patient range", () => {
    const recipient = {
      ...patientRepairEmployee("recipient", "Recipient"),
      requiredBackgroundAssignments: 1,
    };
    const donor = patientRepairEmployee("donor", "Donor");
    const slots = [
      patientRepairSlot({
        id: "literal-bg",
        date: "2026-07-06",
        taskTypeCode: "BACKGROUND",
        employeeId: recipient.id,
        isBackground: true,
      }),
      patientRepairSlot({
        id: "gi",
        date: "2026-07-07",
        taskTypeCode: "NEW_GI",
        employeeId: donor.id,
      }),
      patientRepairSlot({
        id: "allergy",
        date: "2026-07-08",
        taskTypeCode: "NEW_ALLERGY",
        employeeId: donor.id,
      }),
      patientRepairSlot({
        id: "pcp",
        date: "2026-07-09",
        taskTypeCode: "PCP",
        employeeId: donor.id,
      }),
    ];
    const result = selectPatientRangeSwapCandidate({
      recipientEmployee: recipient,
      employees: [recipient, donor],
      slots,
      allAssignments: patientRepairExistingAssignments(slots),
      movableDateSet: new Set(slots.map((slot) => slot.date)),
      mode: "BELOW_MINIMUM",
    });

    assert.equal(result.candidate, null);
    assert.ok(result.blockers.some((blocker) => blocker.includes("BG minimum")));
  });

  it("does not use Saturday or Endoscopy assignments for patient repair", () => {
    const recipient = patientRepairEmployee("recipient", "Recipient");
    const donor = patientRepairEmployee("donor", "Donor");
    const slots = [
      patientRepairSlot({
        id: "saturday-support",
        date: "2026-07-11",
        taskTypeCode: "BACKGROUND",
        employeeId: recipient.id,
        isBackground: true,
        shiftCategory: "SATURDAY",
        startMinute: 8 * 60,
        endMinute: 14 * 60,
        paidHours: 6,
      }),
      patientRepairSlot({
        id: "gi",
        date: "2026-07-07",
        taskTypeCode: "NEW_GI",
        employeeId: donor.id,
      }),
      patientRepairSlot({
        id: "allergy",
        date: "2026-07-08",
        taskTypeCode: "NEW_ALLERGY",
        employeeId: donor.id,
      }),
      patientRepairSlot({
        id: "pcp",
        date: "2026-07-09",
        taskTypeCode: "PCP",
        employeeId: donor.id,
      }),
    ];
    const result = selectPatientRangeSwapCandidate({
      recipientEmployee: recipient,
      employees: [recipient, donor],
      slots,
      allAssignments: patientRepairExistingAssignments(slots),
      movableDateSet: new Set(slots.map((slot) => slot.date)),
      mode: "BELOW_MINIMUM",
    });

    assert.equal(result.candidate, null);
    assert.ok(
      result.blockers.some((blocker) =>
        blocker.includes("no generated, unlocked non-patient assignment"),
      ),
    );
  });

  it("finds a GI Allergy PCP diversity swap when it improves exposure", () => {
    const first = patientRepairEmployee("first", "First");
    const second = patientRepairEmployee("second", "Second");
    const slots = [
      patientRepairSlot({
        id: "first-gi-1",
        date: "2026-07-06",
        taskTypeCode: "NEW_GI",
        employeeId: first.id,
      }),
      patientRepairSlot({
        id: "first-gi-2",
        date: "2026-07-07",
        taskTypeCode: "NEW_GI",
        employeeId: first.id,
      }),
      patientRepairSlot({
        id: "first-pcp",
        date: "2026-07-08",
        taskTypeCode: "PCP",
        employeeId: first.id,
      }),
      patientRepairSlot({
        id: "second-allergy-1",
        date: "2026-07-06",
        taskTypeCode: "NEW_ALLERGY",
        employeeId: second.id,
        startMinute: 13 * 60,
        endMinute: 17 * 60,
      }),
      patientRepairSlot({
        id: "second-allergy-2",
        date: "2026-07-07",
        taskTypeCode: "NEW_ALLERGY",
        employeeId: second.id,
        startMinute: 13 * 60,
        endMinute: 17 * 60,
      }),
      patientRepairSlot({
        id: "second-pcp",
        date: "2026-07-08",
        taskTypeCode: "PCP",
        employeeId: second.id,
        startMinute: 13 * 60,
        endMinute: 17 * 60,
      }),
    ];
    const allAssignments = patientRepairExistingAssignments(slots);
    const candidate = selectPatientDiversitySwapCandidate({
      employees: [first, second],
      slots,
      allAssignments,
      movableDateSet: new Set(slots.map((slot) => slot.date)),
    });

    assert.ok(candidate);
    assert.equal(
      julyPatientShiftGroupFromTaskCode(candidate.firstSlot.taskType.code),
      "GI",
    );
    assert.equal(
      julyPatientShiftGroupFromTaskCode(candidate.secondSlot.taskType.code),
      "ALLERGY",
    );
    applyPatientAssignmentSwapInMemory({
      swap: candidate,
      assignments: allAssignments,
    });
    const diagnostics = buildPatientDiagnosticMap([first, second], slots);

    assert.deepEqual(
      diagnostics.get(first.id)?.missingExposureGroups,
      [],
    );
    assert.deepEqual(
      diagnostics.get(second.id)?.missingExposureGroups,
      [],
    );
  });

  it("builds strict patient diagnostics without counting support roles", () => {
    const diagnostic = buildPatientFairnessDiagnostic({
      employeeId: "employee",
      employeeName: "Employee",
      assignments: [
        { employeeId: "employee", taskTypeCode: "PROCEDURE" },
        { employeeId: "employee", taskTypeCode: "ENDOSCOPY" },
        { employeeId: "employee", taskTypeCode: "BACKGROUND" },
        { employeeId: "employee", taskTypeCode: "NEW_GI" },
        { employeeId: "employee", taskTypeCode: "NEW_ALLERGY" },
        { employeeId: "employee", taskTypeCode: "PCP" },
      ],
    });

    assert.equal(diagnostic.patientShiftCount, 3);
    assert.deepEqual(diagnostic.exposure, {
      GI: 1,
      ALLERGY: 1,
      PCP: 1,
    });
    assert.equal(diagnostic.rangeStatus, "WITHIN_RANGE");
  });

  it("hides migration-only legacy full-day blocks from manager workflow", () => {
    assert.deepEqual(
      managerVisibleShiftBlocks([
        {
          id: "legacy",
          shiftTemplateId: "legacy-default-shift-template",
          source: "MIGRATION",
        },
        { id: "am", shiftTemplateId: "am-template", source: "TEMPLATE" },
      ]).map((block) => block.id),
      ["am"],
    );
  });

  it("marks future schedules for regeneration when an employee is invalidated", () => {
    assert.equal(
      invalidatedTaskSlotStatus({
        remainingAssignments: 0,
        requiredStaff: 1,
        requirementLevel: "REQUIRED",
      }),
      "SHORTAGE",
    );
    assert.deepEqual(
      invalidatedScheduleDayData({
        employeeName: "Employee",
        reason: "deactivated",
        invalidatedAt: new Date("2026-06-01T12:00:00.000Z"),
      }),
      {
        status: "NEEDS_REGENERATION",
        publishedAt: null,
        publishedByEmployeeId: null,
        notes:
          "Needs regeneration: Employee was deactivated on 2026-06-01T12:00:00.000Z.",
      },
    );
  });

  it("formats background task labels without changing stored names", () => {
    assert.equal(
      backgroundTaskDisplayName({ name: "Research", isBackground: true }),
      "Research (Background)",
    );
    assert.equal(
      backgroundTaskDisplayName({
        name: "Research (Background)",
        isBackground: true,
      }),
      "Research (Background)",
    );
  });

  it("preserves generated background obligations during clinic slot reconciliation", () => {
    assert.equal(
      shouldPreserveSlotOutsideStaffingRequirements({
        source: "BACKGROUND_DEFINITION",
        taskTypeOptional: true,
      }),
      true,
    );
    assert.equal(
      shouldPreserveSlotOutsideStaffingRequirements({
        source: EMPLOYEE_BG_MINIMUM_SOURCE,
        taskTypeOptional: false,
      }),
      true,
    );
    assert.equal(
      shouldPreserveSlotOutsideStaffingRequirements({
        source: "STAFFING_RULE",
        taskTypeOptional: false,
      }),
      false,
    );
  });

  it("blocks publishing empty or required-unfilled schedules but allows clinic closed", () => {
    const shiftBlock = {
      name: "Monday 0800-1200",
      startMinute: 480,
      endMinute: 720,
    };
    const requiredSlot = {
      requirementLevel: "REQUIRED",
      requiredStaff: 1,
      status: "SHORTAGE",
      label: "Front Desk #1",
      taskType: { name: "Front Desk" },
      shiftBlock,
      assignments: [],
    };

    assert.deepEqual(
      getSchedulePublishIssues({
        scenario: "ROUTINE",
        status: "GENERATED",
        taskSlots: [],
      }).map((issue) => issue.code),
      ["EMPTY_SCHEDULE"],
    );
    assert.deepEqual(
      getSchedulePublishIssues({
        scenario: "ROUTINE",
        status: "GENERATED",
        taskSlots: [requiredSlot],
      }).map((issue) => issue.code),
      ["NO_ASSIGNMENTS", "REQUIRED_UNFILLED"],
    );
    assert.deepEqual(
      getSchedulePublishIssues({
        scenario: "ROUTINE",
        status: "GENERATED",
        taskSlots: [
          {
            ...requiredSlot,
            label: "Allergy Shots #1",
            taskType: { name: "Allergy Shots", code: "ALLERGY_SHOTS" },
          },
        ],
      }).map((issue) => issue.code),
      ["NO_ASSIGNMENTS"],
    );
    assert.deepEqual(
      getSchedulePublishIssues({
        scenario: "CLINIC_CLOSED",
        status: "GENERATED",
        taskSlots: [],
      }),
      [],
    );
  });

  it("manual multi-shift validation allows non-overlapping AM and PM shifts", () => {
    const warnings = validateManualAssignment({
      employee: {
        id: "employee",
        fullName: "Employee",
        skillIds: [],
        availability: allDayMonday,
      },
      taskType: taskTypes[0],
      slot: {
        id: "pm-slot",
        date: monday,
        taskTypeId: taskTypes[0].id,
        slotIndex: 1,
        startMinute: 780,
        endMinute: 1020,
      },
      assignments: [
        {
          slotId: "am-slot",
          employeeId: "employee",
          date: monday,
          taskTypeId: taskTypes[0].id,
          startMinute: 480,
          endMinute: 720,
        },
      ],
    });

    assert.equal(
      warnings.some((warning) => warning.code === "OVERLAPPING_SHIFT"),
      false,
    );
  });
});

describe("manual OPTO policy", () => {
  it("creates credit and debit adjustments with before and after balances", () => {
    assert.deepEqual(
      calculateOptoAdjustment({
        currentBalance: 8,
        type: "CREDIT",
        hours: 2.5,
      }),
      {
        balanceBefore: 8,
        adjustmentHours: 2.5,
        balanceAfter: 10.5,
      },
    );
    assert.deepEqual(
      calculateOptoAdjustment({
        currentBalance: 10.5,
        type: "DEBIT",
        hours: 1.25,
      }),
      {
        balanceBefore: 10.5,
        adjustmentHours: -1.25,
        balanceAfter: 9.25,
      },
    );
  });

  it("sets an exact balance and allows a negative result", () => {
    assert.deepEqual(
      calculateOptoAdjustment({
        currentBalance: 9,
        type: "SET_BALANCE",
        hours: 4,
      }),
      {
        balanceBefore: 9,
        adjustmentHours: -5,
        balanceAfter: 4,
      },
    );
    assert.deepEqual(
      calculateOptoAdjustment({
        currentBalance: 1,
        type: "DEBIT",
        hours: 2,
      }),
      {
        balanceBefore: 1,
        adjustmentHours: -2,
        balanceAfter: -1,
      },
    );
  });

  it("applies a signed correction", () => {
    assert.deepEqual(
      calculateOptoAdjustment({
        currentBalance: 12,
        type: "CORRECTION",
        hours: -2.5,
      }),
      {
        balanceBefore: 12,
        adjustmentHours: -2.5,
        balanceAfter: 9.5,
      },
    );
  });
});

describe("overtime approval policy", () => {
  it("uses OPTO first when it fully covers logged overtime", () => {
    assert.deepEqual(
      calculateOvertimeApproval({
        requestedHours: 2.5,
        optoBalanceHours: 4,
      }),
      {
        requestedHours: 2.5,
        optoBalanceHours: 4,
        optoAppliedHours: 2.5,
        payableOvertimeHours: 0,
        projectedOptoBalanceHours: 1.5,
      },
    );
  });

  it("splits partially covered overtime into OPTO and payable hours", () => {
    assert.deepEqual(
      calculateOvertimeApproval({
        requestedHours: 5,
        optoBalanceHours: 3,
      }),
      {
        requestedHours: 5,
        optoBalanceHours: 3,
        optoAppliedHours: 3,
        payableOvertimeHours: 2,
        projectedOptoBalanceHours: 0,
      },
    );
  });

  it("makes all overtime payable when OPTO is zero or negative", () => {
    assert.equal(
      calculateOvertimeApproval({
        requestedHours: 4,
        optoBalanceHours: 0,
      }).payableOvertimeHours,
      4,
    );
    assert.equal(
      calculateOvertimeApproval({
        requestedHours: 4,
        optoBalanceHours: -2,
      }).optoAppliedHours,
      0,
    );
  });

  it("accepts only positive quarter-hour overtime entries", () => {
    assert.equal(
      overtimeEntrySchema.parse({
        workDate: "2026-06-18",
        requestedHours: "1.25",
        reason: "",
      }).requestedHours,
      1.25,
    );
    assert.throws(() =>
      overtimeEntrySchema.parse({
        workDate: "2026-06-18",
        requestedHours: "1.1",
      }),
    );
  });

  it("restores applied OPTO and reverses payable overtime", () => {
    assert.deepEqual(
      calculateOvertimeReversal({
        optoAppliedHours: 3,
        payableOvertimeHours: 2,
      }),
      {
        restoredOptoHours: 3,
        payrollReversalHours: -2,
      },
    );
  });

  it("keeps self-service identity and manager review authorization server-side", async () => {
    const [employeeActions, managerActions, service] = await Promise.all([
      fs.readFile(
        path.join(
          process.cwd(),
          "src",
          "app",
          "(app)",
          "employee",
          "actions.ts",
        ),
        "utf8",
      ),
      fs.readFile(
        path.join(
          process.cwd(),
          "src",
          "app",
          "(app)",
          "admin",
          "overtime",
          "actions.ts",
        ),
        "utf8",
      ),
      fs.readFile(
        path.join(process.cwd(), "src", "lib", "db", "overtime.ts"),
        "utf8",
      ),
    ]);

    assert.match(
      employeeActions,
      /createMyOvertimeEntryAction[\s\S]*employeeId:\s*actor\.id/,
    );
    assert.match(managerActions, /requireManager\(\)/);
    assert.match(service, /overtime_entry\.self_create|overtime_entry\.create/);
    assert.match(service, /overtime_entry\.approve/);
    assert.match(service, /overtime_entry\.reject/);
    assert.match(service, /overtime_entry\.reverse/);
    assert.match(service, /opto\.adjust_overtime/);
  });
});

describe("staged manual schedule edits", () => {
  const baseManualState = {
    shiftBlocks: [
      {
        id: "am",
        scheduleDayId: "day",
        date: monday,
      },
      {
        id: "pm",
        scheduleDayId: "day",
        date: monday,
      },
    ],
    slots: [
      {
        id: "slot-am",
        persistedSlotId: "slot-am",
        scheduleDayId: "day",
        date: monday,
        shiftBlockId: "am",
        taskTypeId: "front-desk",
        slotIndex: 1,
        requirementLevel: "REQUIRED" as const,
        requiredStaff: 1,
        source: "STAFFING_RULE",
      },
      {
        id: "slot-pm",
        persistedSlotId: "slot-pm",
        scheduleDayId: "day",
        date: monday,
        shiftBlockId: "pm",
        taskTypeId: "research",
        slotIndex: 1,
        requirementLevel: "OPTIONAL" as const,
        requiredStaff: 1,
        source: "MANUAL",
      },
    ],
    assignments: [
      {
        id: "assignment-a",
        persistedAssignmentId: "assignment-a",
        slotId: "slot-am",
        employeeId: "alice",
        locked: false,
        source: "GENERATED",
        note: null,
      },
      {
        id: "assignment-b",
        persistedAssignmentId: "assignment-b",
        slotId: "slot-pm",
        employeeId: "blake",
        locked: false,
        source: "GENERATED",
        note: null,
      },
    ],
  };

  it("stages an employee swap without mutating the base schedule", () => {
    const draft = applyManualEditBatchToState(baseManualState, {
      weekStart: monday,
      revisions: [],
      assignmentChanges: [
        {
          assignmentId: "assignment-a",
          employeeId: "blake",
          locked: true,
        },
        {
          assignmentId: "assignment-b",
          employeeId: "alice",
          locked: true,
        },
      ],
      addedAssignments: [],
      addedSlots: [],
    });

    assert.deepEqual(
      draft.assignments.map((assignment) => [
        assignment.id,
        assignment.employeeId,
        assignment.source,
        assignment.locked,
      ]),
      [
        ["assignment-a", "blake", "MANUAL_OVERRIDE", true],
        ["assignment-b", "alice", "MANUAL_OVERRIDE", true],
      ],
    );
    assert.equal(baseManualState.assignments[0].employeeId, "alice");
  });

  it("stages a manual optional slot and assignment", () => {
    const draft = applyManualEditBatchToState(baseManualState, {
      weekStart: monday,
      revisions: [],
      assignmentChanges: [],
      addedAssignments: [],
      addedSlots: [
        {
          clientId: "manual-slot",
          date: monday,
          shiftBlockId: "am",
          taskTypeId: "background",
          employeeId: "alice",
          locked: true,
        },
      ],
    });

    assert.equal(draft.slots.at(-1)?.source, "MANUAL");
    assert.equal(draft.slots.at(-1)?.requirementLevel, "OPTIONAL");
    assert.equal(draft.assignments.at(-1)?.source, "MANUAL_OVERRIDE");
  });
});
