import type { ClinicScenario, ShiftCategory } from "@prisma/client";

export type ShortageRecommendationRule = {
  taskTypeId: string | null;
  shiftTemplateId: string | null;
  shiftCategory: ShiftCategory | string | null;
  scenario: ClinicScenario | string | null;
  closurePriority: number;
  managerInstruction: string;
};

export type ShortageRecommendationSlot = {
  taskTypeId: string;
  shiftBlock: {
    shiftTemplateId: string | null;
    shiftCategory: ShiftCategory | string;
  };
};

export function selectShortageRecommendations(input: {
  slot: ShortageRecommendationSlot | undefined;
  scenario: ClinicScenario | string;
  rules: ShortageRecommendationRule[];
  limit?: number;
}) {
  if (!input.slot) {
    return [];
  }

  const limit = input.limit ?? 7;

  return input.rules
    .filter((rule) => {
      if (
        rule.shiftTemplateId &&
        rule.shiftTemplateId !== input.slot?.shiftBlock.shiftTemplateId
      ) {
        return false;
      }

      if (
        rule.shiftCategory &&
        rule.shiftCategory !== input.slot?.shiftBlock.shiftCategory
      ) {
        return false;
      }

      if (rule.scenario && rule.scenario !== input.scenario) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      return (
        left.closurePriority - right.closurePriority ||
        left.managerInstruction.localeCompare(right.managerInstruction)
      );
    })
    .slice(0, limit)
    .map((rule, index) => `${index + 1}. ${rule.managerInstruction}`);
}
