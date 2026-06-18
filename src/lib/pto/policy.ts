import type { PTORequestType } from "@prisma/client";
import { enumerateIsoDates } from "@/lib/utils/date";

export const FULL_DAY_PTO_HOURS = 8;
export const PTO_BALANCE_APPROVAL_FLOOR_HOURS = -24;

const balanceDeductingTypes = new Set<PTORequestType>([
  "PERSONAL",
  "VACATION",
  "PTO",
]);

export function isAutoApprovedPtoType(type: PTORequestType) {
  void type;
  return false;
}

export function deductsPtoBalance(type: PTORequestType) {
  return balanceDeductingTypes.has(type);
}

export function requiresManagerApproval(type: PTORequestType) {
  void type;
  return true;
}

export function calculatePtoHours(input: {
  startDate: string;
  endDate: string;
  startMinute?: number | null;
  endMinute?: number | null;
}) {
  const dateCount = enumerateIsoDates(input.startDate, input.endDate).length;

  if (input.startMinute !== null && input.startMinute !== undefined) {
    const endMinute = input.endMinute ?? input.startMinute;
    return Math.max(0, ((endMinute - input.startMinute) / 60) * dateCount);
  }

  return dateCount * FULL_DAY_PTO_HOURS;
}

export function wouldPutPtoBalanceBelowFloor(input: {
  currentBalanceHours: number;
  requestHours: number;
}) {
  return (
    input.currentBalanceHours - input.requestHours <
    PTO_BALANCE_APPROVAL_FLOOR_HOURS
  );
}
