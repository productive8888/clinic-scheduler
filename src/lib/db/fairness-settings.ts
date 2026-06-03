import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import type { FairnessSettingFormValues } from "@/lib/validation/fairness-setting";
import { parseIsoDate } from "@/lib/utils/date";

export function getFairnessSettings() {
  return getDb().fairnessSetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}

export async function updateFairnessSettings(input: {
  values: FairnessSettingFormValues;
  actorEmployeeId?: string | null;
}) {
  const db = getDb();
  const before = await getFairnessSettings();
  const setting = await db.fairnessSetting.update({
    where: { id: "default" },
    data: {
      windowType: input.values.windowType,
      customStartDate: input.values.customStartDate
        ? parseIsoDate(input.values.customStartDate)
        : null,
      customEndDate: input.values.customEndDate
        ? parseIsoDate(input.values.customEndDate)
        : null,
      clinicalShiftWeight: input.values.clinicalShiftWeight,
      totalShiftWeight: input.values.totalShiftWeight,
      totalHoursWeight: input.values.totalHoursWeight,
      saturdayShiftWeight: input.values.saturdayShiftWeight,
      endoscopyShiftWeight: input.values.endoscopyShiftWeight,
      patternConsistencyWeight: input.values.patternConsistencyWeight,
      patientFacingShiftWeight: input.values.patientFacingShiftWeight,
      skillRoleBalanceWeight: input.values.skillRoleBalanceWeight,
      exposureGoalWeight: input.values.exposureGoalWeight,
      backgroundPenaltyWeight: input.values.backgroundPenaltyWeight,
      active: input.values.active,
      notes: input.values.notes,
    },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "fairness_settings.update",
    entityType: "FairnessSetting",
    entityId: setting.id,
    before,
    after: setting,
  });

  return setting;
}
