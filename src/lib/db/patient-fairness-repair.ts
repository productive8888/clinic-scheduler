import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import {
  loadPatientRepairContext,
  type PatientRepairContext,
} from "@/lib/db/patient-fairness-context";
import {
  JULY_PATIENT_SHIFT_MAXIMUM,
  JULY_PATIENT_SHIFT_MINIMUM,
} from "@/lib/schedule/patient-fairness";
import {
  applyPatientAssignmentSwapInMemory,
  buildPatientDiagnosticMap,
  buildPatientRepairDiagnostics,
  selectPatientDiversitySwapCandidate,
  selectPatientRangeSwapCandidate,
  type PatientAssignmentSwap,
  type PatientFairnessRepairDiagnostic,
} from "@/lib/schedule/patient-fairness-swap";
import { clinicWeekRange } from "@/lib/schedule/range";
import { enumerateIsoDates } from "@/lib/utils/date";

export {
  applyPatientAssignmentSwapInMemory,
  buildPatientDiagnosticMap,
  selectPatientDiversitySwapCandidate,
  selectPatientRangeSwapCandidate,
  type PatientAssignmentSwap,
  type PatientRepairEmployee,
  type PatientRepairSlot,
} from "@/lib/schedule/patient-fairness-swap";

export type PatientFairnessRepairSummary = {
  startDate: string;
  endDate: string;
  rangeSwapsMade: number;
  diversitySwapsMade: number;
  diagnostics: PatientFairnessRepairDiagnostic[];
  swapDetails: PatientFairnessSwapDetail[];
};

type PatientFairnessSwapDetail = {
  kind: "RANGE" | "DIVERSITY";
  firstEmployeeId: string;
  firstEmployeeName: string;
  firstRoleCode: string;
  firstDate: string;
  secondEmployeeId: string;
  secondEmployeeName: string;
  secondRoleCode: string;
  secondDate: string;
};

export async function repairPatientFairnessForRange(input: {
  startDate: string;
  endDate: string;
  allowedDates: string[];
  actorEmployeeId?: string | null;
}): Promise<PatientFairnessRepairSummary> {
  const allowedDateSet = new Set(input.allowedDates);
  const summary: PatientFairnessRepairSummary = {
    startDate: input.startDate,
    endDate: input.endDate,
    rangeSwapsMade: 0,
    diversitySwapsMade: 0,
    diagnostics: [],
    swapDetails: [],
  };

  for (const range of clinicWeeksInRange(input.startDate, input.endDate)) {
    const movableDates = enumerateIsoDates(range.startDate, range.endDate).filter(
      (date) => allowedDateSet.has(date),
    );

    if (movableDates.length === 0) {
      continue;
    }

    const context = await loadPatientRepairContext({
      ...range,
      movableDates,
    });
    const before = buildPatientRepairDiagnostics({
      employees: context.employees,
      slots: context.slots,
      assignments: context.assignments,
      movableDateSet: context.movableDateSet,
      hasGenerationRun: false,
    });
    const rangeResult = await repairPatientRangeForWeek({
      context,
      actorEmployeeId: input.actorEmployeeId,
    });
    summary.rangeSwapsMade += rangeResult.swapsMade;
    summary.swapDetails.push(...rangeResult.details);

    const diversityResult = await repairPatientDiversityForWeek({
      context,
      actorEmployeeId: input.actorEmployeeId,
    });
    summary.diversitySwapsMade += diversityResult.swapsMade;
    summary.swapDetails.push(...diversityResult.details);
    summary.diagnostics.push(
      ...buildPatientRepairDiagnostics({
        employees: context.employees,
        slots: context.slots,
        assignments: context.assignments,
        movableDateSet: context.movableDateSet,
        hasGenerationRun: true,
        before,
      }),
    );
  }

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "schedule.patient_fairness_repair",
    entityType: "ScheduleRange",
    entityId: `${input.startDate}:${input.endDate}`,
    after: summary,
    metadata: {
      allowedDates: [...allowedDateSet].sort(),
      targetRange: [
        JULY_PATIENT_SHIFT_MINIMUM,
        JULY_PATIENT_SHIFT_MAXIMUM,
      ],
    },
  });

  return summary;
}

export async function getPatientFairnessRepairDiagnosticsForRange(input: {
  startDate: string;
  endDate: string;
}) {
  const diagnostics: PatientFairnessRepairDiagnostic[] = [];

  for (const range of clinicWeeksInRange(input.startDate, input.endDate)) {
    const context = await loadPatientRepairContext({
      ...range,
      movableDates: enumerateIsoDates(range.startDate, range.endDate),
    });

    diagnostics.push(
      ...buildPatientRepairDiagnostics({
        employees: context.employees,
        slots: context.slots,
        assignments: context.assignments,
        movableDateSet: context.movableDateSet,
        hasGenerationRun: context.hasGenerationRun,
      }),
    );
  }

  return diagnostics;
}

async function repairPatientRangeForWeek(input: {
  context: PatientRepairContext;
  actorEmployeeId?: string | null;
}) {
  const details: PatientFairnessSwapDetail[] = [];
  const maximumSwaps = Math.max(
    1,
    input.context.slots.length * input.context.employees.length,
  );

  for (let swapIndex = 0; swapIndex < maximumSwaps; swapIndex += 1) {
    const diagnostics = buildPatientDiagnosticMap(
      input.context.employees,
      input.context.slots,
    );
    const belowMinimum = input.context.employees
      .filter(
        (employee) =>
          (diagnostics.get(employee.id)?.patientShiftCount ?? 0) <
          JULY_PATIENT_SHIFT_MINIMUM,
      )
      .sort(compareEmployees);
    const aboveMaximum = input.context.employees
      .filter(
        (employee) =>
          (diagnostics.get(employee.id)?.patientShiftCount ?? 0) >
          JULY_PATIENT_SHIFT_MAXIMUM,
      )
      .sort((left, right) => {
        const countDifference =
          (diagnostics.get(right.id)?.patientShiftCount ?? 0) -
          (diagnostics.get(left.id)?.patientShiftCount ?? 0);

        return countDifference || compareEmployees(left, right);
      });
    let swap: PatientAssignmentSwap | null = null;

    for (const recipientEmployee of belowMinimum) {
      const selection = selectPatientRangeSwapCandidate({
        recipientEmployee,
        employees: input.context.employees,
        slots: input.context.slots,
        allAssignments: input.context.assignments,
        movableDateSet: input.context.movableDateSet,
        mode: "BELOW_MINIMUM",
      });

      if (selection.candidate) {
        swap = rangeCandidateToSwap(selection.candidate);
        break;
      }
    }

    if (!swap) {
      for (const donorEmployee of aboveMaximum) {
        const selection = selectPatientRangeSwapCandidate({
          donorEmployee,
          employees: input.context.employees,
          slots: input.context.slots,
          allAssignments: input.context.assignments,
          movableDateSet: input.context.movableDateSet,
          mode: "ABOVE_MAXIMUM",
        });

        if (selection.candidate) {
          swap = rangeCandidateToSwap(selection.candidate);
          break;
        }
      }
    }

    if (!swap) {
      break;
    }

    await persistPatientAssignmentSwap({
      swap,
      kind: "RANGE",
      actorEmployeeId: input.actorEmployeeId,
    });
    applyPatientAssignmentSwapInMemory({
      swap,
      assignments: input.context.assignments,
    });
    details.push(swapDetail("RANGE", swap));
  }

  return { swapsMade: details.length, details };
}

async function repairPatientDiversityForWeek(input: {
  context: PatientRepairContext;
  actorEmployeeId?: string | null;
}) {
  const details: PatientFairnessSwapDetail[] = [];
  const maximumSwaps = Math.max(1, input.context.slots.length);

  for (let swapIndex = 0; swapIndex < maximumSwaps; swapIndex += 1) {
    const candidate = selectPatientDiversitySwapCandidate({
      employees: input.context.employees,
      slots: input.context.slots,
      allAssignments: input.context.assignments,
      movableDateSet: input.context.movableDateSet,
    });

    if (!candidate) {
      break;
    }

    const swap: PatientAssignmentSwap = candidate;
    await persistPatientAssignmentSwap({
      swap,
      kind: "DIVERSITY",
      actorEmployeeId: input.actorEmployeeId,
    });
    applyPatientAssignmentSwapInMemory({
      swap,
      assignments: input.context.assignments,
    });
    details.push(swapDetail("DIVERSITY", swap));
  }

  return { swapsMade: details.length, details };
}

async function persistPatientAssignmentSwap(input: {
  swap: PatientAssignmentSwap;
  kind: "RANGE" | "DIVERSITY";
  actorEmployeeId?: string | null;
}) {
  const notes =
    input.kind === "RANGE"
      ? "Generated patient-fairness swap to move both employees toward the required 2-5 weekly range."
      : "Generated patient-fairness swap to improve GI, Allergy, and PCP exposure diversity.";

  await getDb().$transaction(async (tx) => {
    await tx.assignment.update({
      where: { id: input.swap.firstAssignment.id },
      data: {
        taskSlotId: input.swap.secondSlot.id,
        assignedByEmployeeId: input.actorEmployeeId ?? undefined,
        notes,
      },
    });
    await tx.assignment.update({
      where: { id: input.swap.secondAssignment.id },
      data: {
        taskSlotId: input.swap.firstSlot.id,
        assignedByEmployeeId: input.actorEmployeeId ?? undefined,
        notes,
      },
    });
  });
}

function rangeCandidateToSwap(
  candidate: NonNullable<
    ReturnType<typeof selectPatientRangeSwapCandidate>["candidate"]
  >,
): PatientAssignmentSwap {
  return {
    firstEmployee: candidate.recipientEmployee,
    firstAssignment: candidate.recipientAssignment,
    firstSlot: candidate.recipientSourceSlot,
    secondEmployee: candidate.donorEmployee,
    secondAssignment: candidate.donorAssignment,
    secondSlot: candidate.donorPatientSlot,
  };
}

function swapDetail(
  kind: PatientFairnessSwapDetail["kind"],
  swap: PatientAssignmentSwap,
): PatientFairnessSwapDetail {
  return {
    kind,
    firstEmployeeId: swap.firstEmployee.id,
    firstEmployeeName: swap.firstEmployee.fullName,
    firstRoleCode: swap.firstSlot.taskType.code,
    firstDate: swap.firstSlot.date,
    secondEmployeeId: swap.secondEmployee.id,
    secondEmployeeName: swap.secondEmployee.fullName,
    secondRoleCode: swap.secondSlot.taskType.code,
    secondDate: swap.secondSlot.date,
  };
}

function clinicWeeksInRange(startDate: string, endDate: string) {
  const weekStarts = [
    ...new Set(
      enumerateIsoDates(startDate, endDate).map(
        (date) => clinicWeekRange(date).startDate,
      ),
    ),
  ].sort();

  return weekStarts.map(clinicWeekRange);
}

function compareEmployees(
  left: { id: string; fullName: string },
  right: { id: string; fullName: string },
) {
  return (
    left.fullName.localeCompare(right.fullName) ||
    left.id.localeCompare(right.id)
  );
}
