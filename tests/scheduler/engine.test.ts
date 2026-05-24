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
import { selectDefaultTaskTypesForScenario } from "../../src/lib/schedule/scenarios";
import { enumerateIsoDates } from "../../src/lib/utils/date";

const monday = "2026-06-01";
const allDayMonday = [
  {
    weekday: 1,
    startMinute: 0,
    endMinute: 1440,
    effectiveStartDate: "2026-01-01",
  },
];

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
