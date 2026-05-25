import type { RequestStatus } from "@prisma/client";
import { calculatePtoHours } from "@/lib/pto/policy";

export const DEFAULT_NPTO_CAP_HOURS = 240;

export function calculateNptoHours(input: {
  startDate: string;
  endDate: string;
  startMinute?: number | null;
  endMinute?: number | null;
}) {
  return calculatePtoHours(input);
}

export function wouldExceedNptoCap(input: {
  usedHours: number;
  requestHours: number;
  capHours: number;
}) {
  return input.usedHours + input.requestHours > input.capHours;
}

export function nptoDeductsPtoBalance() {
  return false;
}

export function formatNptoCapDenial(input: {
  usedHours: number;
  requestHours: number;
  capHours: number;
}) {
  return `Denied automatically: ${input.usedHours + input.requestHours} NPTO hours would exceed the configured ${input.capHours} hour cap.`;
}

export function isScheduleBlockingNptoStatus(status: RequestStatus) {
  return status === "APPROVED" || status === "OVERRIDDEN";
}
