export const LEGACY_SHIFT_TEMPLATE_ID = "legacy-default-shift-template";

export type ShiftBlockIdentity = {
  shiftTemplateId?: string | null;
  source?: string | null;
};

export function isLegacyShiftBlock(shiftBlock: ShiftBlockIdentity) {
  return (
    shiftBlock.shiftTemplateId === LEGACY_SHIFT_TEMPLATE_ID ||
    shiftBlock.source === "MIGRATION" ||
    shiftBlock.source === "FALLBACK"
  );
}

export function managerVisibleShiftBlocks<T extends ShiftBlockIdentity>(
  shiftBlocks: T[],
) {
  return shiftBlocks.filter((shiftBlock) => !isLegacyShiftBlock(shiftBlock));
}
