import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateSchedule,
  resolveDirectReplacement,
  type SchedulerEmployee,
  type SchedulerTaskSlot,
  type SchedulerTaskType,
} from "../../src/lib/scheduler";

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
