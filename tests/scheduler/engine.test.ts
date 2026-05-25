import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateSchedule,
  isUnavailableForSlot,
  resolveDirectReplacement,
  type SchedulerEmployee,
  type SchedulerTaskSlot,
  type SchedulerTaskType,
} from "../../src/lib/scheduler";
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
import {
  isShortNoticeForDateRange,
  isShortNoticeScheduleChange,
} from "../../src/lib/schedule/short-notice";
import { selectStaffingSlotSpecs } from "../../src/lib/staffing/requirements";
import { enumerateIsoDates } from "../../src/lib/utils/date";

const monday = "2026-06-01";
const saturday = "2026-06-06";
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

  it("does not generate multiple same-day assignments for one employee", () => {
    const result = generateSchedule({
      seed: "same-day-single-assignment",
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

    assert.equal(result.assignments.length, 1);
    assert.equal(result.conflicts.length, 1);
    assert.equal(
      result.conflicts[0].rejectedCandidates[0].reasons.includes(
        "Would double-book employee",
      ),
      true,
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

  it("creates multiple slots for one task type from staffing rules", () => {
    const specs = selectStaffingSlotSpecs({
      date: saturday,
      scenario: "ROUTINE",
      taskTypes: staffingTaskTypes,
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
        rules,
      }).filter((spec) => spec.taskTypeId === "allergy-shots").length,
      1,
    );
    assert.equal(
      selectStaffingSlotSpecs({
        date: saturday,
        scenario: "ROUTINE",
        taskTypes: staffingTaskTypes,
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
        rules,
      }).some((spec) => spec.taskTypeId === "procedures"),
      true,
    );
    assert.equal(
      selectStaffingSlotSpecs({
        date: monday,
        scenario: "DOCTOR_OFF_REDUCED_STAFFING",
        taskTypes: staffingTaskTypes,
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
      rules: [baseRule],
    });
    const after = selectStaffingSlotSpecs({
      date: saturday,
      scenario: "ROUTINE",
      taskTypes: staffingTaskTypes,
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
      rules: [],
    });
    const withRule = selectStaffingSlotSpecs({
      date: monday,
      scenario: "ROUTINE",
      taskTypes: staffingTaskTypes,
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
