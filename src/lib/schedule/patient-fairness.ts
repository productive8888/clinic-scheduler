import {
  julyPatientShiftGroupFromTaskCode,
  type JulyPatientShiftGroup,
} from "@/lib/schedule/patient-shifts";

export const JULY_PATIENT_SHIFT_MINIMUM = 2;
export const JULY_PATIENT_SHIFT_MAXIMUM = 5;
export const JULY_PATIENT_SHIFT_GROUPS: JulyPatientShiftGroup[] = [
  "GI",
  "ALLERGY",
  "PCP",
];

export type PatientFairnessRangeStatus =
  | "BELOW_MINIMUM"
  | "WITHIN_RANGE"
  | "ABOVE_MAXIMUM";

export type PatientFairnessAssignment = {
  employeeId: string;
  taskTypeCode: string;
};

export type PatientFairnessDiagnostic = {
  employeeId: string;
  employeeName: string;
  patientShiftCount: number;
  exposure: Record<JulyPatientShiftGroup, number>;
  rangeStatus: PatientFairnessRangeStatus;
  missingExposureGroups: JulyPatientShiftGroup[];
};

export function buildPatientFairnessDiagnostic(input: {
  employeeId: string;
  employeeName: string;
  assignments: PatientFairnessAssignment[];
}): PatientFairnessDiagnostic {
  const exposure: Record<JulyPatientShiftGroup, number> = {
    GI: 0,
    ALLERGY: 0,
    PCP: 0,
  };

  for (const assignment of input.assignments) {
    if (assignment.employeeId !== input.employeeId) {
      continue;
    }

    const group = julyPatientShiftGroupFromTaskCode(
      assignment.taskTypeCode,
    );

    if (group) {
      exposure[group] += 1;
    }
  }

  const patientShiftCount = JULY_PATIENT_SHIFT_GROUPS.reduce(
    (total, group) => total + exposure[group],
    0,
  );

  return {
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    patientShiftCount,
    exposure,
    rangeStatus: patientFairnessRangeStatus(patientShiftCount),
    missingExposureGroups: JULY_PATIENT_SHIFT_GROUPS.filter(
      (group) => exposure[group] === 0,
    ),
  };
}

export function patientFairnessRangeStatus(
  patientShiftCount: number,
): PatientFairnessRangeStatus {
  if (patientShiftCount < JULY_PATIENT_SHIFT_MINIMUM) {
    return "BELOW_MINIMUM";
  }

  if (patientShiftCount > JULY_PATIENT_SHIFT_MAXIMUM) {
    return "ABOVE_MAXIMUM";
  }

  return "WITHIN_RANGE";
}

export function patientFairnessDistance(patientShiftCount: number) {
  if (patientShiftCount < JULY_PATIENT_SHIFT_MINIMUM) {
    return JULY_PATIENT_SHIFT_MINIMUM - patientShiftCount;
  }

  if (patientShiftCount > JULY_PATIENT_SHIFT_MAXIMUM) {
    return patientShiftCount - JULY_PATIENT_SHIFT_MAXIMUM;
  }

  return 0;
}
