import { getConstraintRejections } from "./constraints";
import { scoreCandidate } from "./scoring";
import type {
  CandidateRejection,
  ExistingAssignment,
  ScheduleAssignment,
  SchedulerEmployee,
  SchedulerFairnessSettings,
  SchedulerRule,
  SchedulerTaskSlot,
  SchedulerTaskType,
} from "./types";

export type AssignmentSelection = {
  assignment?: ScheduleAssignment;
  rejectedCandidates: CandidateRejection[];
};

export function selectAssignment(input: {
  seed: string;
  slot: SchedulerTaskSlot;
  taskType: SchedulerTaskType;
  employees: SchedulerEmployee[];
  rules: SchedulerRule[];
  fairness?: SchedulerFairnessSettings;
  assignments: ExistingAssignment[];
}): AssignmentSelection {
  const rejectedCandidates: CandidateRejection[] = [];
  const candidates = input.employees
    .map((employee) => {
      const reasons = getConstraintRejections(
        employee,
        input.taskType,
        input.slot,
        input.assignments,
      );

      if (reasons.length > 0) {
        rejectedCandidates.push({ employeeId: employee.id, reasons });
        return null;
      }

      return {
        employee,
        score: scoreCandidate({
          seed: input.seed,
          employee,
          taskType: input.taskType,
          slot: input.slot,
          assignments: input.assignments,
          rules: input.rules,
          fairness: input.fairness,
        }),
      };
    })
    .filter((candidate): candidate is { employee: SchedulerEmployee; score: number } =>
      Boolean(candidate),
    )
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.employee.id.localeCompare(right.employee.id);
    });

  const winner = candidates[0];

  if (!winner) {
    return { rejectedCandidates };
  }

  return {
    rejectedCandidates,
    assignment: {
      slotId: input.slot.id,
      employeeId: winner.employee.id,
      taskTypeId: input.taskType.id,
      date: input.slot.date,
      source: "GENERATED",
      score: winner.score,
    },
  };
}

export function toExistingAssignment(
  assignment: ScheduleAssignment,
  slot: SchedulerTaskSlot,
  taskType?: SchedulerTaskType,
): ExistingAssignment {
  return {
    slotId: assignment.slotId,
    employeeId: assignment.employeeId,
    date: assignment.date,
    taskTypeId: assignment.taskTypeId,
    startMinute: slot.startMinute,
    endMinute: slot.endMinute,
    shiftBlockId: slot.shiftBlockId,
    shiftCategory: slot.shiftCategory,
    paidHours: slot.paidHours,
    isPatientFacing: taskType?.isPatientFacing,
    isClinical: taskType?.isClinical,
    isBackground: taskType?.isBackground,
    isFloat: taskType?.isFloat,
    isEndoscopy: taskType?.isEndoscopy,
    canBePulledForClinic: slot.canBePulledForClinic,
    protectedFromPull: slot.protectedFromPull,
    locked: assignment.source === "LOCKED",
  };
}
