export function calculateOvertimeApproval(input: {
  requestedHours: number;
  optoBalanceHours: number;
}) {
  const requestedHours = roundHours(input.requestedHours);
  const optoBalanceHours = roundHours(input.optoBalanceHours);

  if (!Number.isFinite(requestedHours) || requestedHours <= 0) {
    throw new Error("Overtime hours must be greater than zero.");
  }

  const availableOptoHours = Math.max(0, optoBalanceHours);
  const optoAppliedHours = roundHours(
    Math.min(requestedHours, availableOptoHours),
  );
  const payableOvertimeHours = roundHours(
    requestedHours - optoAppliedHours,
  );

  return {
    requestedHours,
    optoBalanceHours,
    optoAppliedHours,
    payableOvertimeHours,
    projectedOptoBalanceHours: roundHours(
      optoBalanceHours - optoAppliedHours,
    ),
  };
}

export function calculateOvertimeReversal(input: {
  optoAppliedHours: number;
  payableOvertimeHours: number;
}) {
  return {
    restoredOptoHours: roundHours(Math.max(0, input.optoAppliedHours)),
    payrollReversalHours: roundHours(
      -Math.max(0, input.payableOvertimeHours),
    ),
  };
}

function roundHours(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
