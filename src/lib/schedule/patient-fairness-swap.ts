import { AssignmentSource } from "@prisma/client";
import { isCanonicalBgTaskType } from "@/lib/schedule/bg-role";
import {
  buildPatientFairnessDiagnostic,
  JULY_PATIENT_SHIFT_MAXIMUM,
  JULY_PATIENT_SHIFT_MINIMUM,
  type PatientFairnessDiagnostic,
} from "@/lib/schedule/patient-fairness";
import { julyPatientShiftGroupFromTaskCode } from "@/lib/schedule/patient-shifts";
import { validateEmployeeWeekPattern } from "@/lib/schedule/work-pattern-requirements";
import { getConstraintRejections } from "@/lib/scheduler/constraints";
import type {
  ExistingAssignment,
  SchedulerEmployee,
  SchedulerTaskSlot,
  SchedulerTaskType,
} from "@/lib/scheduler";

export type PatientRepairEmployee = SchedulerEmployee & {
  expectedHours: number;
  requiredBackgroundAssignments: number;
};

export type PatientRepairAssignment = {
  id: string;
  employeeId: string;
  locked: boolean;
  source: AssignmentSource | string;
};

export type PatientRepairSlot = SchedulerTaskSlot & {
  scheduleDayId: string;
  scheduleDayStatus: string;
  source: string;
  taskType: SchedulerTaskType;
  assignments: PatientRepairAssignment[];
};

export type PatientRangeSwapCandidate = {
  recipientEmployee: PatientRepairEmployee;
  recipientAssignment: PatientRepairAssignment;
  recipientSourceSlot: PatientRepairSlot;
  donorEmployee: PatientRepairEmployee;
  donorAssignment: PatientRepairAssignment;
  donorPatientSlot: PatientRepairSlot;
};

export type PatientDiversitySwapCandidate = {
  firstEmployee: PatientRepairEmployee;
  firstAssignment: PatientRepairAssignment;
  firstSlot: PatientRepairSlot;
  secondEmployee: PatientRepairEmployee;
  secondAssignment: PatientRepairAssignment;
  secondSlot: PatientRepairSlot;
};

export type PatientAssignmentSwap = {
  firstEmployee: PatientRepairEmployee;
  firstAssignment: PatientRepairAssignment;
  firstSlot: PatientRepairSlot;
  secondEmployee: PatientRepairEmployee;
  secondAssignment: PatientRepairAssignment;
  secondSlot: PatientRepairSlot;
};

export type PatientFairnessRepairDiagnostic = PatientFairnessDiagnostic & {
  repairAttempted: boolean;
  repairState:
    | "NOT_NEEDED"
    | "REPAIRED"
    | "FEASIBLE_SWAP_AVAILABLE"
    | "BLOCKED";
  blocker: string | null;
};

export function selectPatientRangeSwapCandidate(input: {
  recipientEmployee?: PatientRepairEmployee;
  donorEmployee?: PatientRepairEmployee;
  employees: PatientRepairEmployee[];
  slots: PatientRepairSlot[];
  allAssignments: ExistingAssignment[];
  movableDateSet?: Set<string>;
  mode: "BELOW_MINIMUM" | "ABOVE_MAXIMUM";
}) {
  const diagnostics = buildPatientDiagnosticMap(input.employees, input.slots);
  const movableDateSet = input.movableDateSet ?? new Set<string>();
  const recipients = input.recipientEmployee
    ? [input.recipientEmployee]
    : input.employees
        .filter(
          (employee) =>
            (diagnostics.get(employee.id)?.patientShiftCount ?? 0) <
            JULY_PATIENT_SHIFT_MAXIMUM,
        )
        .sort((left, right) => {
          const leftCount =
            diagnostics.get(left.id)?.patientShiftCount ?? 0;
          const rightCount =
            diagnostics.get(right.id)?.patientShiftCount ?? 0;

          return leftCount - rightCount || compareRepairEmployees(left, right);
        });
  const donors = input.donorEmployee
    ? [input.donorEmployee]
    : input.employees
        .filter(
          (employee) =>
            (diagnostics.get(employee.id)?.patientShiftCount ?? 0) >
            JULY_PATIENT_SHIFT_MINIMUM,
        )
        .sort((left, right) => {
          const leftCount =
            diagnostics.get(left.id)?.patientShiftCount ?? 0;
          const rightCount =
            diagnostics.get(right.id)?.patientShiftCount ?? 0;

          return rightCount - leftCount || compareRepairEmployees(left, right);
        });
  const blockers: string[] = [];

  for (const recipientEmployee of recipients) {
    const recipientDiagnostic = diagnostics.get(recipientEmployee.id);

    if (
      !recipientDiagnostic ||
      recipientDiagnostic.patientShiftCount >= JULY_PATIENT_SHIFT_MAXIMUM
    ) {
      continue;
    }

    const sourceOptions = movableAssignmentsForEmployee({
      employeeId: recipientEmployee.id,
      slots: input.slots,
      movableDateSet,
      patient: false,
    });

    if (sourceOptions.length === 0) {
      blockers.push(
        `${recipientEmployee.fullName} has no generated, unlocked non-patient assignment available to exchange.`,
      );
      continue;
    }

    for (const donorEmployee of donors) {
      if (donorEmployee.id === recipientEmployee.id) {
        continue;
      }

      const donorDiagnostic = diagnostics.get(donorEmployee.id);

      if (
        !donorDiagnostic ||
        donorDiagnostic.patientShiftCount <= JULY_PATIENT_SHIFT_MINIMUM
      ) {
        continue;
      }

      const donorOptions = movableAssignmentsForEmployee({
        employeeId: donorEmployee.id,
        slots: input.slots,
        movableDateSet,
        patient: true,
      });

      for (const source of sourceOptions) {
        for (const donor of donorOptions) {
          const candidate: PatientRangeSwapCandidate = {
            recipientEmployee,
            recipientAssignment: source.assignment,
            recipientSourceSlot: source.slot,
            donorEmployee,
            donorAssignment: donor.assignment,
            donorPatientSlot: donor.slot,
          };
          const blocker = patientRangeSwapBlocker({
            candidate,
            allAssignments: input.allAssignments,
            slots: input.slots,
          });

          if (!blocker) {
            return { candidate, blockers: unique(blockers) };
          }

          blockers.push(blocker);
        }
      }
    }
  }

  if (donors.length === 0) {
    blockers.push(
      "No employee can donate a patient shift while remaining at the two-shift minimum.",
    );
  }

  return {
    candidate: null,
    blockers: unique(blockers).slice(0, 8),
  };
}

export function selectPatientDiversitySwapCandidate(input: {
  employees: PatientRepairEmployee[];
  slots: PatientRepairSlot[];
  allAssignments: ExistingAssignment[];
  movableDateSet: Set<string>;
}) {
  const diagnostics = buildPatientDiagnosticMap(input.employees, input.slots);

  for (const firstEmployee of [...input.employees].sort(compareRepairEmployees)) {
    const firstDiagnostic = diagnostics.get(firstEmployee.id);

    if (
      !firstDiagnostic ||
      firstDiagnostic.patientShiftCount < 3 ||
      firstDiagnostic.missingExposureGroups.length === 0
    ) {
      continue;
    }

    for (const missingGroup of firstDiagnostic.missingExposureGroups) {
      const firstOptions = movableAssignmentsForEmployee({
        employeeId: firstEmployee.id,
        slots: input.slots,
        movableDateSet: input.movableDateSet,
        patient: true,
      }).filter((option) => {
        const group = patientGroupForSlot(option.slot);

        return Boolean(group && firstDiagnostic.exposure[group] > 1);
      });

      for (const firstOption of firstOptions) {
        const firstGroup = patientGroupForSlot(firstOption.slot);

        if (!firstGroup) {
          continue;
        }

        for (const secondEmployee of [...input.employees].sort(
          compareRepairEmployees,
        )) {
          if (secondEmployee.id === firstEmployee.id) {
            continue;
          }

          const secondDiagnostic = diagnostics.get(secondEmployee.id);

          if (!secondDiagnostic) {
            continue;
          }

          const secondOptions = movableAssignmentsForEmployee({
            employeeId: secondEmployee.id,
            slots: input.slots,
            movableDateSet: input.movableDateSet,
            patient: true,
          }).filter(
            (option) => patientGroupForSlot(option.slot) === missingGroup,
          );

          for (const secondOption of secondOptions) {
            if (
              secondDiagnostic.exposure[missingGroup] <= 1 &&
              secondDiagnostic.exposure[firstGroup] > 0
            ) {
              continue;
            }

            const candidate: PatientDiversitySwapCandidate = {
              firstEmployee,
              firstAssignment: firstOption.assignment,
              firstSlot: firstOption.slot,
              secondEmployee,
              secondAssignment: secondOption.assignment,
              secondSlot: secondOption.slot,
            };

            if (
              !patientAssignmentSwapBlocker({
                firstEmployee,
                firstSlot: firstOption.slot,
                secondEmployee,
                secondSlot: secondOption.slot,
                allAssignments: input.allAssignments,
                slots: input.slots,
              })
            ) {
              return candidate;
            }
          }
        }
      }
    }
  }

  return null;
}

export function buildPatientRepairDiagnostics(input: {
  employees: PatientRepairEmployee[];
  slots: PatientRepairSlot[];
  assignments: ExistingAssignment[];
  movableDateSet: Set<string>;
  hasGenerationRun: boolean;
  before?: PatientFairnessRepairDiagnostic[];
}) {
  const diagnostics = buildPatientDiagnosticMap(input.employees, input.slots);
  const beforeByEmployeeId = new Map(
    (input.before ?? []).map((diagnostic) => [
      diagnostic.employeeId,
      diagnostic,
    ]),
  );

  return input.employees.map((employee) => {
    const diagnostic = diagnostics.get(employee.id)!;
    const previous = beforeByEmployeeId.get(employee.id);
    const needsRangeRepair = diagnostic.rangeStatus !== "WITHIN_RANGE";
    const selection = needsRangeRepair
      ? selectPatientRangeSwapCandidate({
          ...(diagnostic.rangeStatus === "BELOW_MINIMUM"
            ? { recipientEmployee: employee }
            : { donorEmployee: employee }),
          employees: input.employees,
          slots: input.slots,
          allAssignments: input.assignments,
          movableDateSet: input.movableDateSet,
          mode:
            diagnostic.rangeStatus === "BELOW_MINIMUM"
              ? "BELOW_MINIMUM"
              : "ABOVE_MAXIMUM",
        })
      : null;
    const repaired = Boolean(
      previous &&
        previous.rangeStatus !== "WITHIN_RANGE" &&
        diagnostic.rangeStatus === "WITHIN_RANGE",
    );
    const repairAttempted =
      repaired || (needsRangeRepair && input.hasGenerationRun);

    return {
      ...diagnostic,
      repairAttempted,
      repairState: repaired
        ? ("REPAIRED" as const)
        : !needsRangeRepair
          ? ("NOT_NEEDED" as const)
          : selection?.candidate
            ? ("FEASIBLE_SWAP_AVAILABLE" as const)
            : ("BLOCKED" as const),
      blocker:
        needsRangeRepair && !selection?.candidate
          ? selection?.blockers[0] ??
            "No legal patient-role exchange was available."
          : null,
    };
  });
}

export function buildPatientDiagnosticMap(
  employees: PatientRepairEmployee[],
  slots: PatientRepairSlot[],
) {
  const assignments = slots.flatMap((slot) =>
    slot.assignments.map((assignment) => ({
      employeeId: assignment.employeeId,
      taskTypeCode: slot.taskType.code,
    })),
  );

  return new Map(
    employees.map((employee) => {
      const diagnostic = buildPatientFairnessDiagnostic({
        employeeId: employee.id,
        employeeName: employee.fullName,
        assignments,
      });

      return [employee.id, diagnostic] as const;
    }),
  );
}

export function toPatientExistingAssignment(
  slot: PatientRepairSlot,
  employeeId: string,
  locked = false,
): ExistingAssignment {
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
    isPatientFacing: Boolean(patientGroupForSlot(slot)),
    isClinical: slot.taskType.isClinical,
    isBackground: slot.taskType.isBackground,
    isFloat: slot.taskType.isFloat,
    isEndoscopy: slot.taskType.isEndoscopy,
    exposureGroup: patientGroupForSlot(slot),
    canBePulledForClinic: slot.canBePulledForClinic,
    protectedFromPull: slot.protectedFromPull,
    locked,
  };
}

export function applyPatientAssignmentSwapInMemory(input: {
  swap: PatientAssignmentSwap;
  assignments: ExistingAssignment[];
}) {
  const {
    firstAssignment,
    firstSlot,
    secondAssignment,
    secondSlot,
  } = input.swap;

  firstSlot.assignments = firstSlot.assignments
    .filter((assignment) => assignment.id !== firstAssignment.id)
    .concat(secondAssignment);
  secondSlot.assignments = secondSlot.assignments
    .filter((assignment) => assignment.id !== secondAssignment.id)
    .concat(firstAssignment);

  removePatientExistingAssignment(input.assignments, {
    employeeId: firstAssignment.employeeId,
    slotId: firstSlot.id,
  });
  removePatientExistingAssignment(input.assignments, {
    employeeId: secondAssignment.employeeId,
    slotId: secondSlot.id,
  });
  input.assignments.push(
    toPatientExistingAssignment(
      secondSlot,
      firstAssignment.employeeId,
      firstAssignment.locked,
    ),
    toPatientExistingAssignment(
      firstSlot,
      secondAssignment.employeeId,
      secondAssignment.locked,
    ),
  );
}

export function removePatientExistingAssignment(
  assignments: ExistingAssignment[],
  input: { employeeId: string; slotId: string },
) {
  const index = assignments.findIndex(
    (assignment) =>
      assignment.employeeId === input.employeeId &&
      assignment.slotId === input.slotId,
  );

  if (index >= 0) {
    assignments.splice(index, 1);
  }
}

function patientRangeSwapBlocker(input: {
  candidate: PatientRangeSwapCandidate;
  allAssignments: ExistingAssignment[];
  slots: PatientRepairSlot[];
}) {
  if (
    isCanonicalBgTaskType(input.candidate.recipientSourceSlot.taskType) &&
    literalBgCountForEmployee(
      input.candidate.recipientEmployee.id,
      input.slots,
      input.allAssignments,
    ) <= input.candidate.recipientEmployee.requiredBackgroundAssignments
  ) {
    return `${input.candidate.recipientEmployee.fullName} cannot give up literal BG without dropping below their BG minimum.`;
  }

  return patientAssignmentSwapBlocker({
    firstEmployee: input.candidate.recipientEmployee,
    firstSlot: input.candidate.recipientSourceSlot,
    secondEmployee: input.candidate.donorEmployee,
    secondSlot: input.candidate.donorPatientSlot,
    allAssignments: input.allAssignments,
    slots: input.slots,
  });
}

function patientAssignmentSwapBlocker(input: {
  firstEmployee: PatientRepairEmployee;
  firstSlot: PatientRepairSlot;
  secondEmployee: PatientRepairEmployee;
  secondSlot: PatientRepairSlot;
  allAssignments: ExistingAssignment[];
  slots: PatientRepairSlot[];
}) {
  const baseAssignments = withoutAssignments(input.allAssignments, [
    {
      employeeId: input.firstEmployee.id,
      slotId: input.firstSlot.id,
    },
    {
      employeeId: input.secondEmployee.id,
      slotId: input.secondSlot.id,
    },
  ]);
  const firstIntoSecond = toPatientExistingAssignment(
    input.secondSlot,
    input.firstEmployee.id,
  );
  const firstRejections = getConstraintRejections(
    input.firstEmployee,
    input.secondSlot.taskType,
    input.secondSlot,
    baseAssignments,
  );

  if (firstRejections.length > 0) {
    return `${input.firstEmployee.fullName} cannot take ${input.secondSlot.taskType.name}: ${firstRejections.join(", ")}.`;
  }

  const secondRejections = getConstraintRejections(
    input.secondEmployee,
    input.firstSlot.taskType,
    input.firstSlot,
    [...baseAssignments, firstIntoSecond],
  );

  if (secondRejections.length > 0) {
    return `${input.secondEmployee.fullName} cannot take ${input.firstSlot.taskType.name}: ${secondRejections.join(", ")}.`;
  }

  const swappedAssignments = [
    ...baseAssignments,
    firstIntoSecond,
    toPatientExistingAssignment(input.firstSlot, input.secondEmployee.id),
  ];

  for (const employee of [input.firstEmployee, input.secondEmployee]) {
    const beforeHours = uniqueScheduledHoursForEmployee(
      input.allAssignments,
      employee.id,
    );
    const afterHours = uniqueScheduledHoursForEmployee(
      swappedAssignments,
      employee.id,
    );

    if (beforeHours !== afterHours) {
      return `${employee.fullName} would change from ${beforeHours} to ${afterHours} hours.`;
    }

    const validation = validateEmployeeWeekPattern({
      employee,
      assignments: workPatternAssignmentsForEmployee(
        swappedAssignments,
        employee.id,
      ),
    });

    if (
      !validation.hasRequiredSaturday ||
      validation.missingExtraHourWeekdays.length > 0
    ) {
      return `${employee.fullName} would lose a required Saturday or extra-hour work-pattern shift.`;
    }

    const literalBgCount = literalBgCountForEmployee(
      employee.id,
      input.slots,
      swappedAssignments,
    );

    if (literalBgCount < employee.requiredBackgroundAssignments) {
      return `${employee.fullName} would fall to ${literalBgCount}/${employee.requiredBackgroundAssignments} literal BG assignments.`;
    }
  }

  return null;
}

function movableAssignmentsForEmployee(input: {
  employeeId: string;
  slots: PatientRepairSlot[];
  movableDateSet: Set<string>;
  patient: boolean;
}) {
  return input.slots
    .filter((slot) => {
      const isPatient = Boolean(patientGroupForSlot(slot));

      return (
        isPatient === input.patient &&
        isMovableSlot(slot, input.movableDateSet)
      );
    })
    .flatMap((slot) =>
      slot.assignments
        .filter(
          (assignment) =>
            assignment.employeeId === input.employeeId &&
            isMovableAssignment(assignment),
        )
        .map((assignment) => ({ slot, assignment })),
    )
    .sort(
      (left, right) =>
        left.slot.date.localeCompare(right.slot.date) ||
        (left.slot.startMinute ?? 0) - (right.slot.startMinute ?? 0) ||
        left.slot.taskType.code.localeCompare(right.slot.taskType.code) ||
        left.slot.id.localeCompare(right.slot.id),
    );
}

function isMovableSlot(slot: PatientRepairSlot, movableDateSet: Set<string>) {
  return Boolean(
    movableDateSet.has(slot.date) &&
      slot.scheduleDayStatus !== "PUBLISHED" &&
      slot.source !== "MANUAL" &&
      new Date(`${slot.date}T00:00:00.000Z`).getUTCDay() !== 6 &&
      slot.shiftCategory !== "ENDO" &&
      slot.shiftCategory !== "SATURDAY" &&
      !slot.taskType.isEndoscopy &&
      !slot.protectedFromPull,
  );
}

function isMovableAssignment(assignment: PatientRepairAssignment) {
  return Boolean(
    !assignment.locked &&
      (assignment.source === AssignmentSource.GENERATED ||
        assignment.source === AssignmentSource.COVERAGE_REPLACEMENT),
  );
}

function patientGroupForSlot(slot: PatientRepairSlot) {
  return julyPatientShiftGroupFromTaskCode(slot.taskType.code);
}

function literalBgCountForEmployee(
  employeeId: string,
  slots: PatientRepairSlot[],
  assignments: ExistingAssignment[],
) {
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));

  return assignments.filter((assignment) => {
    if (assignment.employeeId !== employeeId) {
      return false;
    }

    const slot = slotById.get(assignment.slotId);

    return slot ? isCanonicalBgTaskType(slot.taskType) : false;
  }).length;
}

function withoutAssignments(
  assignments: ExistingAssignment[],
  removals: Array<{ employeeId: string; slotId: string }>,
) {
  const next = [...assignments];

  for (const removal of removals) {
    removePatientExistingAssignment(next, removal);
  }

  return next;
}

function uniqueScheduledHoursForEmployee(
  assignments: ExistingAssignment[],
  employeeId: string,
) {
  const hoursByShift = new Map<string, number>();

  for (const assignment of assignments) {
    if (assignment.employeeId !== employeeId) {
      continue;
    }

    hoursByShift.set(
      `${assignment.date}:${assignment.shiftBlockId ?? assignment.slotId}`,
      Number(assignment.paidHours ?? 0),
    );
  }

  return [...hoursByShift.values()].reduce(
    (total, hours) => total + hours,
    0,
  );
}

function workPatternAssignmentsForEmployee(
  assignments: ExistingAssignment[],
  employeeId: string,
) {
  return assignments
    .filter((assignment) => assignment.employeeId === employeeId)
    .map((assignment) => ({
      date: assignment.date,
      shiftBlockId: assignment.shiftBlockId ?? assignment.slotId,
      shiftCategory: assignment.shiftCategory,
      startMinute: assignment.startMinute,
      endMinute: assignment.endMinute,
      paidHours: assignment.paidHours,
    }));
}

function compareRepairEmployees(
  left: PatientRepairEmployee,
  right: PatientRepairEmployee,
) {
  return (
    left.fullName.localeCompare(right.fullName) ||
    left.id.localeCompare(right.id)
  );
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}
