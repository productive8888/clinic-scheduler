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
import { parseEastonWorkbook } from "../../src/lib/easton-import/parser";
import {
  findEastonTargetForEmployee,
  findEmployeeForEastonTarget,
} from "../../src/lib/easton-import/employee-targets";
import {
  eastonEmployeeProfileUpdateFromTarget,
  eastonShiftTemplateDataFromShift,
} from "../../src/lib/db/easton-import";
import { selectBackgroundMinimumConversionCandidate } from "../../src/lib/db/background-top-off";
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
  formatNptoCapDenial,
  isScheduleBlockingNptoStatus,
  nptoDeductsPtoBalance,
  wouldExceedNptoCap,
} from "../../src/lib/npto/policy";
import { buildStaffingAnalytics } from "../../src/lib/analytics/staffing";
import { buildAssignmentCalendarEvents } from "../../src/lib/calendar/events";
import { buildIcsCalendar } from "../../src/lib/calendar/ics";
import { selectDefaultTaskTypesForScenario } from "../../src/lib/schedule/scenarios";
import { validateManualAssignment } from "../../src/lib/schedule/manual-validation";
import { getSchedulePublishIssues } from "../../src/lib/schedule/publish-validation";
import {
  clinicWeekRange,
  monthCalendarRange,
  planScheduleRange,
  planUnpublishScheduleRange,
  resolveScheduleRange,
} from "../../src/lib/schedule/range";
import {
  buildWeekStaffSummary,
  buildWeekDayHealth,
  buildWholeDayShiftGroups,
  summarizeShiftBlocks,
} from "../../src/lib/schedule/views";
import { shouldPreserveSlotOutsideStaffingRequirements } from "../../src/lib/schedule/slot-reconciliation";
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

  it("auto-approves sick and emergency requests", () => {
    assert.equal(isAutoApprovedPtoType("SICK"), true);
    assert.equal(isAutoApprovedPtoType("EMERGENCY"), true);
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

  it("denies NPTO when the configured cap would be exceeded", () => {
    assert.equal(
      wouldExceedNptoCap({
        usedHours: 236,
        requestHours: 8,
        capHours: 240,
      }),
      true,
    );
    assert.equal(
      formatNptoCapDenial({
        usedHours: 236,
        requestHours: 8,
        capHours: 240,
      }).includes("exceed the configured 240 hour cap"),
      true,
    );
  });

  it("allows admin override of NPTO cap denial to block scheduling", () => {
    assert.equal(
      wouldExceedNptoCap({
        usedHours: 240,
        requestHours: 8,
        capHours: 240,
      }),
      true,
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
      "GI + Allergy",
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
        warning.includes("Allergy Shots is deprecated for July generation"),
      ),
      true,
    );
    assert.equal(preview.sampleAssignments.length, 0);
  });
});

describe("Easton July hard requirements", () => {
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

  it("uses exact July target groups ahead of old generic Easton work patterns", () => {
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

  it("treats old generic Easton patterns as non-authoritative without an exact July target", () => {
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
          candidate.reasons.includes("Outside July work skeleton"),
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
        "Outside July work skeleton",
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
          expectedWeeklyHours: 0,
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

  it("passes when BG minimum, Saturday group, and extra-hour days are met", () => {
    const result = evaluateWeeklyHardRequirements({
      targets: [
        {
          employeeId: "yvonne",
          employeeName: "Yvonne",
          workPatternCode: "EASTON_GROUP_T_TH",
          requiredBackgroundAssignments: 2,
          extraHourWeekdays: [2, 4],
          expectedWeeklyHours: 16,
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
            expectedWeeklyHours: 0,
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
        "Giulia has 0/1 required BG assignments.",
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
          expectedWeeklyHours: 0,
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
    assert.equal(ics.includes("Civil Surgeon"), false);
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
  it("defines distinct IT, prior authorization, and Research skills", () => {
    assert.deepEqual(
      REQUIRED_CONFIGURABLE_SKILLS.map((skill) => skill.code),
      ["IT", "PRIOR_AUTHORIZATION", "RESEARCH"],
    );
    assert.deepEqual(REQUIRED_TASK_SKILL_CODES.PRIOR_AUTHORIZATION, [
      "PRIOR_AUTHORIZATION",
    ]);
  });

  it("parses required weekly BG shifts from the employee form", () => {
    const parsed = employeeFormSchema.parse({
      fullName: "Test Employee",
      email: "test@example.com",
      authProviderId: "",
      role: "EMPLOYEE",
      status: "ACTIVE",
      ptoBalanceHours: "0",
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
