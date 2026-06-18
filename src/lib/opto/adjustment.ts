import type { OptoAdjustmentType } from "@prisma/client";

export type OptoAdjustmentInput = {
  currentBalance: number;
  type: OptoAdjustmentType;
  hours: number;
  allowNegative?: boolean;
};

export function calculateOptoAdjustment(input: OptoAdjustmentInput) {
  const currentBalance = roundHours(input.currentBalance);
  const hours = roundHours(input.hours);

  if (!Number.isFinite(hours)) {
    throw new Error("Enter a valid OPTO hour amount.");
  }

  let adjustmentHours: number;
  let balanceAfter: number;

  switch (input.type) {
    case "CREDIT":
      requirePositive(hours);
      adjustmentHours = hours;
      balanceAfter = currentBalance + hours;
      break;
    case "DEBIT":
      requirePositive(hours);
      adjustmentHours = -hours;
      balanceAfter = currentBalance - hours;
      break;
    case "SET_BALANCE":
      if (hours < 0 && !input.allowNegative) {
        throw new Error("OPTO balance cannot be negative.");
      }
      balanceAfter = hours;
      adjustmentHours = balanceAfter - currentBalance;
      break;
    case "CORRECTION":
      if (hours === 0) {
        throw new Error("Correction amount cannot be zero.");
      }
      adjustmentHours = hours;
      balanceAfter = currentBalance + hours;
      break;
  }

  balanceAfter = roundHours(balanceAfter);
  adjustmentHours = roundHours(adjustmentHours);

  if (balanceAfter < 0 && !input.allowNegative) {
    throw new Error("OPTO balance cannot be negative.");
  }

  return {
    balanceBefore: currentBalance,
    adjustmentHours,
    balanceAfter,
  };
}

function requirePositive(value: number) {
  if (value <= 0) {
    throw new Error("OPTO hour amount must be greater than zero.");
  }
}

function roundHours(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
