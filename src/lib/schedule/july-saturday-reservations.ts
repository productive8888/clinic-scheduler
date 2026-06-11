import {
  dateToWeekday,
  getConstraintRejections,
} from "@/lib/scheduler/constraints";
import type {
  ExistingAssignment,
  SchedulerEmployee,
  SchedulerTaskSlot,
  SchedulerTaskType,
} from "@/lib/scheduler";

export type JulySaturdayReservation = {
  slotId: string;
  employeeId: string;
  reason: "EASTON_ENDOSCOPY_SATURDAY" | "EASTON_NON_ENDOSCOPY_SATURDAY";
};

export type JulySaturdayReservationUnresolved = {
  employeeId: string;
  employeeName: string;
  reason: string;
};

export type JulySaturdayReservationPlan = {
  reservations: JulySaturdayReservation[];
  reservationsBySlotId: Map<string, string[]>;
  unresolved: JulySaturdayReservationUnresolved[];
};

export function buildJulySaturdayReservationPlan(input: {
  date: string;
  employees: SchedulerEmployee[];
  slots: SchedulerTaskSlot[];
  taskTypes: SchedulerTaskType[];
  existingAssignments?: ExistingAssignment[];
}): JulySaturdayReservationPlan {
  const reservations: JulySaturdayReservation[] = [];
  const reservationsBySlotId = new Map<string, string[]>();
  const unresolved: JulySaturdayReservationUnresolved[] = [];

  if (dateToWeekday(input.date) !== 6) {
    return { reservations, reservationsBySlotId, unresolved };
  }

  const taskTypesById = new Map(input.taskTypes.map((taskType) => [taskType.id, taskType]));
  const occupiedAssignments = [
    ...(input.existingAssignments ?? []),
    ...lockedAssignmentsFromSlots(input.slots, taskTypesById),
  ];

  const endoscopyTaskTypeIds = new Set(
    input.taskTypes
      .filter((taskType) => taskType.isEndoscopy || taskType.code === "ENDOSCOPY")
      .map((taskType) => taskType.id),
  );
  const endoscopyEmployees = input.employees
    .filter((employee) => isEndoscopySaturdayEmployee(employee, endoscopyTaskTypeIds))
    .sort(compareEndoscopyEmployees(endoscopyTaskTypeIds));
  const regularSaturdayEmployees = input.employees
    .filter((employee) => isRegularSaturdayEmployee(employee))
    .sort(compareEmployees);

  for (const employee of endoscopyEmployees) {
    const candidateSlots = sortReservationSlots(
      input.slots.filter((slot) => isEndoscopySaturdaySlot(slot, taskTypesById)),
      taskTypesById,
    );
    const reserved = reserveEmployeeIntoFirstOpenSlot({
      employee,
      candidateSlots,
      taskTypesById,
      occupiedAssignments,
      reservations,
      reservationsBySlotId,
      reason: "EASTON_ENDOSCOPY_SATURDAY",
      ignoreMissingSkill: true,
    });

    if (!reserved) {
      unresolved.push({
        employeeId: employee.id,
        employeeName: employee.fullName,
        reason: explainReservationBlockers({
          employee,
          candidateSlots,
          taskTypesById,
          occupiedAssignments,
          reservationsBySlotId,
          ignoreMissingSkill: true,
          label: "Saturday 0600-1400 Endoscopy",
        }),
      });
    }
  }

  for (const employee of regularSaturdayEmployees) {
    const candidateSlots = sortReservationSlots(
      input.slots.filter((slot) => isRegularSaturdaySlot(slot, taskTypesById)),
      taskTypesById,
    );
    const reserved = reserveEmployeeIntoFirstOpenSlot({
      employee,
      candidateSlots,
      taskTypesById,
      occupiedAssignments,
      reservations,
      reservationsBySlotId,
      reason: "EASTON_NON_ENDOSCOPY_SATURDAY",
      ignoreMissingSkill: false,
    });

    if (!reserved && candidateSlots.length > 0) {
      unresolved.push({
        employeeId: employee.id,
        employeeName: employee.fullName,
        reason: explainReservationBlockers({
          employee,
          candidateSlots,
          taskTypesById,
          occupiedAssignments,
          reservationsBySlotId,
          ignoreMissingSkill: false,
          label: "Saturday 0800-1400 work-pattern shift",
        }),
      });
    }
  }

  return { reservations, reservationsBySlotId, unresolved };
}

function reserveEmployeeIntoFirstOpenSlot(input: {
  employee: SchedulerEmployee;
  candidateSlots: SchedulerTaskSlot[];
  taskTypesById: Map<string, SchedulerTaskType>;
  occupiedAssignments: ExistingAssignment[];
  reservations: JulySaturdayReservation[];
  reservationsBySlotId: Map<string, string[]>;
  reason: JulySaturdayReservation["reason"];
  ignoreMissingSkill: boolean;
}) {
  for (const slot of input.candidateSlots) {
    const taskType = input.taskTypesById.get(slot.taskTypeId);

    if (!taskType || isSlotFull(slot, input.reservationsBySlotId)) {
      continue;
    }

    const blockers = reservationBlockers({
      employee: input.employee,
      taskType,
      slot,
      occupiedAssignments: input.occupiedAssignments,
      ignoreMissingSkill: input.ignoreMissingSkill,
    });

    if (blockers.length > 0) {
      continue;
    }

    input.reservations.push({
      slotId: slot.id,
      employeeId: input.employee.id,
      reason: input.reason,
    });
    const slotReservations = input.reservationsBySlotId.get(slot.id) ?? [];
    slotReservations.push(input.employee.id);
    input.reservationsBySlotId.set(slot.id, slotReservations);
    input.occupiedAssignments.push(toReservationAssignment(slot, taskType, input.employee.id));
    return true;
  }

  return false;
}

function isEndoscopySaturdayEmployee(
  employee: SchedulerEmployee,
  endoscopyTaskTypeIds: Set<string>,
) {
  if (employee.active === false) {
    return false;
  }

  if (
    employee.workPattern?.kind === "ENDOSCOPY_SATURDAY" ||
    employee.workPattern?.requiredSaturdayShiftCategory === "ENDO"
  ) {
    return true;
  }

  return [...endoscopyTaskTypeIds].some(
    (taskTypeId) => (employee.targetTaskAssignments?.[taskTypeId] ?? 0) > 0,
  );
}

function isRegularSaturdayEmployee(employee: SchedulerEmployee) {
  return (
    employee.active !== false &&
    employee.workPattern?.kind === "NON_ENDOSCOPY_SATURDAY" &&
    employee.workPattern.requiredSaturdayShiftCategory === "SATURDAY"
  );
}

function isEndoscopySaturdaySlot(
  slot: SchedulerTaskSlot,
  taskTypesById: Map<string, SchedulerTaskType>,
) {
  const taskType = taskTypesById.get(slot.taskTypeId);

  return (
    dateToWeekday(slot.date) === 6 &&
    slot.shiftCategory === "ENDO" &&
    Number(slot.paidHours ?? 0) === 8 &&
    (taskType?.isEndoscopy === true || taskType?.code === "ENDOSCOPY")
  );
}

function isRegularSaturdaySlot(
  slot: SchedulerTaskSlot,
  taskTypesById: Map<string, SchedulerTaskType>,
) {
  const taskType = taskTypesById.get(slot.taskTypeId);

  return (
    dateToWeekday(slot.date) === 6 &&
    slot.shiftCategory === "SATURDAY" &&
    Number(slot.paidHours ?? 0) === 6 &&
    taskType?.isEndoscopy !== true
  );
}

function reservationBlockers(input: {
  employee: SchedulerEmployee;
  taskType: SchedulerTaskType;
  slot: SchedulerTaskSlot;
  occupiedAssignments: ExistingAssignment[];
  ignoreMissingSkill: boolean;
}) {
  const reasons = getConstraintRejections(
    input.employee,
    input.taskType,
    input.slot,
    input.occupiedAssignments,
  );

  return input.ignoreMissingSkill
    ? reasons.filter((reason) => reason !== "Missing required skill")
    : reasons;
}

function explainReservationBlockers(input: {
  employee: SchedulerEmployee;
  candidateSlots: SchedulerTaskSlot[];
  taskTypesById: Map<string, SchedulerTaskType>;
  occupiedAssignments: ExistingAssignment[];
  reservationsBySlotId: Map<string, string[]>;
  ignoreMissingSkill: boolean;
  label: string;
}) {
  if (input.candidateSlots.length === 0) {
    return `Could not reserve ${input.label}: no matching task slot exists.`;
  }

  const reasons = new Set<string>();

  for (const slot of input.candidateSlots) {
    const taskType = input.taskTypesById.get(slot.taskTypeId);

    if (isSlotFull(slot, input.reservationsBySlotId)) {
      reasons.add("matching task slot is already full");
    }

    if (!taskType) {
      reasons.add("task type not found");
      continue;
    }

    for (const reason of reservationBlockers({
      employee: input.employee,
      taskType,
      slot,
      occupiedAssignments: input.occupiedAssignments,
      ignoreMissingSkill: input.ignoreMissingSkill,
    })) {
      reasons.add(reason);
    }
  }

  const detail = [...reasons].slice(0, 5).join("; ");

  return detail
    ? `Could not reserve ${input.label}: ${detail}.`
    : `Could not reserve ${input.label}.`;
}

function isSlotFull(
  slot: SchedulerTaskSlot,
  reservationsBySlotId: Map<string, string[]>,
) {
  const lockedCount =
    (slot.lockedEmployeeIds?.length ?? 0) + (slot.lockedEmployeeId ? 1 : 0);
  const reservedCount = reservationsBySlotId.get(slot.id)?.length ?? 0;

  return lockedCount + reservedCount >= Math.max(1, slot.requiredStaff ?? 1);
}

function lockedAssignmentsFromSlots(
  slots: SchedulerTaskSlot[],
  taskTypesById: Map<string, SchedulerTaskType>,
) {
  const assignments: ExistingAssignment[] = [];

  for (const slot of slots) {
    const taskType = taskTypesById.get(slot.taskTypeId);

    if (!taskType) {
      continue;
    }

    const lockedEmployeeIds = [
      ...(slot.lockedEmployeeIds ?? []),
      ...(slot.lockedEmployeeId ? [slot.lockedEmployeeId] : []),
    ];

    for (const employeeId of lockedEmployeeIds) {
      assignments.push(toReservationAssignment(slot, taskType, employeeId, true));
    }
  }

  return assignments;
}

function toReservationAssignment(
  slot: SchedulerTaskSlot,
  taskType: SchedulerTaskType,
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
    isPatientFacing: taskType.isPatientFacing,
    isClinical: taskType.isClinical,
    isBackground: taskType.isBackground,
    isFloat: taskType.isFloat,
    isEndoscopy: taskType.isEndoscopy,
    canBePulledForClinic: slot.canBePulledForClinic,
    protectedFromPull: slot.protectedFromPull,
    locked,
  };
}

function sortReservationSlots(
  slots: SchedulerTaskSlot[],
  taskTypesById: Map<string, SchedulerTaskType>,
) {
  return [...slots].sort((left, right) => {
    const leftTask = taskTypesById.get(left.taskTypeId);
    const rightTask = taskTypesById.get(right.taskTypeId);

    return (
      objectivePriority(leftTask) - objectivePriority(rightTask) ||
      requirementPriority(left) - requirementPriority(right) ||
      (left.startMinute ?? 0) - (right.startMinute ?? 0) ||
      left.slotIndex - right.slotIndex ||
      left.id.localeCompare(right.id)
    );
  });
}

function objectivePriority(taskType: SchedulerTaskType | undefined) {
  if (taskType?.isEndoscopy) return 0;
  if (taskType?.isPatientFacing) return 1;
  if (taskType?.isClinical) return 2;
  if (taskType?.isFloat) return 3;
  if (taskType?.isBackground) return 4;

  return 3;
}

function requirementPriority(slot: SchedulerTaskSlot) {
  switch (slot.requirementLevel) {
    case "REQUIRED":
      return 0;
    case "DESIRED":
      return 1;
    case "CONDITIONAL":
      return 2;
    case "OPTIONAL":
      return 3;
    default:
      return 0;
  }
}

function compareEndoscopyEmployees(endoscopyTaskTypeIds: Set<string>) {
  return (left: SchedulerEmployee, right: SchedulerEmployee) => {
    const leftTarget = maxTargetCount(left, endoscopyTaskTypeIds);
    const rightTarget = maxTargetCount(right, endoscopyTaskTypeIds);

    return rightTarget - leftTarget || compareEmployees(left, right);
  };
}

function maxTargetCount(
  employee: SchedulerEmployee,
  taskTypeIds: Set<string>,
) {
  return [...taskTypeIds].reduce(
    (max, taskTypeId) =>
      Math.max(max, employee.targetTaskAssignments?.[taskTypeId] ?? 0),
    0,
  );
}

function compareEmployees(left: SchedulerEmployee, right: SchedulerEmployee) {
  return left.fullName.localeCompare(right.fullName) || left.id.localeCompare(right.id);
}
