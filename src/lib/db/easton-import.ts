import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db";
import {
  isDeprecatedEastonJulyRoleCode,
  normalizeEastonRoleCode,
  parseEastonWorkbook,
  type EastonEmployeeTarget,
  type EastonParsedShift,
  type EastonWorkbookPreview,
} from "@/lib/easton-import/parser";
import { findEmployeeForEastonTarget } from "@/lib/easton-import/employee-targets";
import { eastonWorkPatternGroups } from "@/lib/easton-import/work-patterns";
import {
  REQUIRED_CONFIGURABLE_SKILLS,
  REQUIRED_TASK_SKILL_CODES,
} from "@/lib/skills/catalog";

const EASTON_STAFFING_NOTE = "Easton spreadsheet default:";
const EASTON_SHORTAGE_NOTE = "Easton default:";
const DEPRECATED_JULY_TASK_CODES = ["ALLERGY_SHOTS"] as const;

const REQUIRED_ROLE_CODES = new Set([
  "NEW_GI",
  "VIRTUAL_GI",
  "NEW_ALLERGY",
  "VIRTUAL_ALLERGY",
  "PCP",
  "PROCEDURE",
  "CIVIL_SURGEON",
  "ENDOSCOPY",
  "FRONT_DESK",
  "IT",
]);

const BACKGROUND_ROLE_CODES = new Set([
  "BACKGROUND",
  "RESEARCH",
  "BOOKING",
  "FLOAT",
  "FRONT_BACKGROUND",
]);

const EASTON_TASK_TYPE_DEFAULTS = [
  {
    code: "NEW_GI",
    name: "New GI",
    optional: false,
    isPatientFacing: true,
    isClinical: true,
    isBackground: false,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    isClosureCandidate: false,
    defaultForRoutine: false,
    defaultForReduced: false,
  },
  {
    code: "VIRTUAL_GI",
    name: "Virtual GI",
    optional: false,
    isPatientFacing: true,
    isClinical: true,
    isBackground: false,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    isClosureCandidate: false,
    defaultForRoutine: false,
    defaultForReduced: false,
  },
  {
    code: "NEW_ALLERGY",
    name: "New Allergy",
    optional: false,
    isPatientFacing: true,
    isClinical: true,
    isBackground: false,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    isClosureCandidate: false,
    defaultForRoutine: false,
    defaultForReduced: false,
  },
  {
    code: "VIRTUAL_ALLERGY",
    name: "Virtual Allergy",
    optional: false,
    isPatientFacing: true,
    isClinical: true,
    isBackground: false,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    isClosureCandidate: false,
    defaultForRoutine: false,
    defaultForReduced: false,
  },
  {
    code: "FOLLOWUP",
    name: "Followup",
    optional: false,
    isPatientFacing: true,
    isClinical: true,
    isBackground: false,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    isClosureCandidate: false,
    defaultForRoutine: false,
    defaultForReduced: false,
  },
  {
    code: "PCP",
    name: "PCP",
    optional: false,
    isPatientFacing: true,
    isClinical: true,
    isBackground: false,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    isClosureCandidate: false,
    defaultForRoutine: false,
    defaultForReduced: false,
  },
  {
    code: "FRONT_DESK",
    name: "Front Desk",
    optional: false,
    isPatientFacing: true,
    isClinical: false,
    isBackground: false,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    isClosureCandidate: false,
    defaultForRoutine: false,
    defaultForReduced: false,
  },
  {
    code: "FRONT_BACKGROUND",
    name: "Front Background",
    optional: true,
    isPatientFacing: false,
    isClinical: false,
    isBackground: true,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    isClosureCandidate: true,
    defaultForRoutine: false,
    defaultForReduced: false,
  },
  {
    code: "PROCEDURE",
    name: "Procedure",
    optional: false,
    isPatientFacing: true,
    isClinical: true,
    isBackground: false,
    isSkilled: true,
    isEndoscopy: false,
    isFloat: false,
    isClosureCandidate: false,
    defaultForRoutine: false,
    defaultForReduced: false,
  },
  {
    code: "CIVIL_SURGEON",
    name: "Civil Surgeon",
    optional: false,
    isPatientFacing: true,
    isClinical: true,
    isBackground: false,
    isSkilled: true,
    isEndoscopy: false,
    isFloat: false,
    isClosureCandidate: true,
    defaultForRoutine: false,
    defaultForReduced: false,
  },
  {
    code: "ENDOSCOPY",
    name: "Endoscopy",
    optional: false,
    isPatientFacing: true,
    isClinical: true,
    isBackground: false,
    isSkilled: true,
    isEndoscopy: true,
    isFloat: false,
    isClosureCandidate: false,
    defaultForRoutine: false,
    defaultForReduced: false,
  },
  {
    code: "IT",
    name: "IT",
    optional: false,
    isPatientFacing: true,
    isClinical: true,
    isBackground: false,
    isSkilled: true,
    isEndoscopy: false,
    isFloat: false,
    isClosureCandidate: true,
    defaultForRoutine: false,
    defaultForReduced: false,
  },
  {
    code: "RESEARCH",
    name: "Research",
    optional: true,
    isPatientFacing: false,
    isClinical: false,
    isBackground: true,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    isClosureCandidate: true,
    defaultForRoutine: false,
    defaultForReduced: false,
  },
  {
    code: "BOOKING",
    name: "Booking",
    optional: true,
    isPatientFacing: false,
    isClinical: false,
    isBackground: true,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    isClosureCandidate: true,
    defaultForRoutine: false,
    defaultForReduced: false,
  },
  {
    code: "FLOAT",
    name: "Float",
    optional: true,
    isPatientFacing: false,
    isClinical: false,
    isBackground: true,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: true,
    isClosureCandidate: true,
    defaultForRoutine: false,
    defaultForReduced: false,
  },
  {
    code: "BACKGROUND",
    name: "Background",
    optional: true,
    isPatientFacing: false,
    isClinical: false,
    isBackground: true,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    isClosureCandidate: true,
    defaultForRoutine: false,
    defaultForReduced: false,
  },
] as const;

const SHORTAGE_DEFAULTS = [
  {
    priority: 1,
    taskCode: "FLOAT",
    instruction: "First pull from Float assignments before reducing clinic coverage.",
  },
  {
    priority: 2,
    taskCode: "BACKGROUND",
    instruction: "Then pull from non-essential Background work that is marked pullable.",
  },
  {
    priority: 3,
    taskCode: "BOOKING",
    instruction: "Then pull from Booking if the task is not protected for the period.",
  },
  {
    priority: 4,
    taskCode: "FRONT_BACKGROUND",
    instruction: "Then pull from Front Background support.",
  },
  {
    priority: 5,
    taskCode: "IT",
    instruction: "Then consider pulling IT and closing shots only with manager review.",
  },
  {
    priority: 6,
    taskCode: "NEW_ALLERGY",
    instruction:
      "Then consider cutting the 4th allergy person and using a 3-gap-year allergy round robin.",
  },
  {
    priority: 7,
    taskCode: "CIVIL_SURGEON",
    instruction: "Civil is the last closure candidate and requires explicit manager review.",
  },
];

const BACKGROUND_PULL_DEFAULTS = [
  { name: "Yvonne", priorityRank: 1, maxPullsPerPeriod: null },
  { name: "Katie", priorityRank: 2, maxPullsPerPeriod: 1 },
  { name: "Hanna", priorityRank: 3, maxPullsPerPeriod: 1 },
  { name: "Easton", priorityRank: 4, maxPullsPerPeriod: 2 },
  { name: "Angela", priorityRank: 5, maxPullsPerPeriod: 1 },
  { name: "Nicole", priorityRank: 6, maxPullsPerPeriod: 1 },
  { name: "Vicky", priorityRank: 7, maxPullsPerPeriod: 1 },
  { name: "Iris", priorityRank: 8, maxPullsPerPeriod: 1 },
  { name: "Kodhai", priorityRank: 9, maxPullsPerPeriod: 1 },
];

export async function getEastonImportPageData() {
  const [preview, reviews] = await Promise.all([
    parseEastonWorkbook(),
    getDb().eastonImportReview.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { createdBy: true },
    }),
  ]);

  return { preview, reviews };
}

export async function saveEastonImportReview(input: {
  actorEmployeeId?: string | null;
}) {
  const preview = await parseEastonWorkbook();
  const review = await getDb().eastonImportReview.create({
    data: {
      sourcePath: preview.workbookPath ?? "not-found",
      workbookModifiedAt: preview.workbookModifiedAt
        ? new Date(preview.workbookModifiedAt)
        : null,
      summary: previewSummaryJson(preview),
      warnings: preview.warnings.length
        ? (preview.warnings as Prisma.InputJsonArray)
        : undefined,
      createdByEmployeeId: input.actorEmployeeId ?? null,
    },
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "easton_import.review_saved",
    entityType: "EastonImportReview",
    entityId: review.id,
    after: {
      workbookPath: preview.workbookPath,
      shiftCount: preview.shifts.length,
      roleDemandCount: preview.roleDemand.length,
      employeeTargetCount: preview.employeeTargets.length,
    },
  });

  return review;
}

export async function applyEastonDefaultsFromWorkbook(input: {
  actorEmployeeId?: string | null;
  workbookPath?: string | null;
}) {
  const preview = await parseEastonWorkbook(input.workbookPath);

  if (!preview.workbookPath) {
    throw new Error("No private Easton workbook found to apply.");
  }

  const result = await getDb().$transaction(async (tx) => {
    await tx.payrollSettings.upsert({
      where: { id: "default" },
      update: {
        endoscopyExtraHoursPolicy: "BANK_PTO",
        endoscopyShortenShiftSuggestions: false,
      },
      create: {
        id: "default",
        endoscopyExtraHoursPolicy: "BANK_PTO",
        endoscopyShortenShiftSuggestions: false,
      },
    });

    await tx.fairnessSetting.upsert({
      where: { id: "default" },
      update: {
        windowType: "TWO_WEEKS",
        patternConsistencyWeight: 35,
        patientFacingShiftWeight: 22,
        skillRoleBalanceWeight: 18,
        exposureGoalWeight: 14,
        backgroundPenaltyWeight: 20,
        active: true,
        notes:
          "Easton default: week-to-week consistency, patient-facing fairness, skill/role balance, and GI/Allergy/PCP exposure are soft scoring goals.",
      },
      create: {
        id: "default",
        windowType: "TWO_WEEKS",
        patternConsistencyWeight: 35,
        patientFacingShiftWeight: 22,
        skillRoleBalanceWeight: 18,
        exposureGoalWeight: 14,
        backgroundPenaltyWeight: 20,
        active: true,
        notes:
          "Easton default: week-to-week consistency, patient-facing fairness, skill/role balance, and GI/Allergy/PCP exposure are soft scoring goals.",
      },
    });

    const taskTypeByCode = new Map<string, string>();

    for (const taskType of EASTON_TASK_TYPE_DEFAULTS) {
      const record = await tx.taskType.upsert({
        where: { code: taskType.code },
        update: {
          name: taskType.name,
          optional: taskType.optional,
          defaultForRoutine: taskType.defaultForRoutine,
          defaultForReduced: taskType.defaultForReduced,
          isPatientFacing: taskType.isPatientFacing,
          isClinical: taskType.isClinical,
          isBackground: taskType.isBackground,
          isSkilled: taskType.isSkilled,
          isEndoscopy: taskType.isEndoscopy,
          isFloat: taskType.isFloat,
          isClosureCandidate: taskType.isClosureCandidate,
          active: true,
        },
        create: {
          code: taskType.code,
          name: taskType.name,
          optional: taskType.optional,
          defaultForRoutine: taskType.defaultForRoutine,
          defaultForReduced: taskType.defaultForReduced,
          isPatientFacing: taskType.isPatientFacing,
          isClinical: taskType.isClinical,
          isBackground: taskType.isBackground,
          isSkilled: taskType.isSkilled,
          isEndoscopy: taskType.isEndoscopy,
          isFloat: taskType.isFloat,
          isClosureCandidate: taskType.isClosureCandidate,
          difficultyWeight: taskType.isSkilled ? 2 : 0,
          sortOrder: 500,
        },
      });

      taskTypeByCode.set(record.code, record.id);
    }

    const configurableSkillIdByCode = new Map<string, string>();

    for (const skill of REQUIRED_CONFIGURABLE_SKILLS) {
      const record = await tx.skill.upsert({
        where: { code: skill.code },
        update: {
          name: skill.name,
          description: skill.description,
          active: true,
        },
        create: skill,
      });
      configurableSkillIdByCode.set(record.code, record.id);
    }

    for (const [taskCode, skillCodes] of Object.entries(REQUIRED_TASK_SKILL_CODES)) {
      const taskTypeId = taskTypeByCode.get(taskCode);

      if (!taskTypeId) {
        continue;
      }

      for (const skillCode of skillCodes) {
        const skillId = configurableSkillIdByCode.get(skillCode);

        if (!skillId) {
          continue;
        }

        await tx.taskSkillRequirement.upsert({
          where: { taskTypeId_skillId: { taskTypeId, skillId } },
          update: { required: true },
          create: { taskTypeId, skillId, required: true },
        });
      }
    }

    const deprecatedJulyTaskTypes = await tx.taskType.findMany({
      where: { code: { in: [...DEPRECATED_JULY_TASK_CODES] } },
      select: { id: true, code: true },
    });
    const deprecatedJulyTaskTypeIds = deprecatedJulyTaskTypes.map((taskType) => taskType.id);

    if (deprecatedJulyTaskTypeIds.length > 0) {
      await tx.taskType.updateMany({
        where: { id: { in: deprecatedJulyTaskTypeIds } },
        data: {
          active: false,
          defaultForRoutine: false,
          defaultForReduced: false,
          optional: true,
        },
      });
      await tx.staffingRequirementRule.updateMany({
        where: { taskTypeId: { in: deprecatedJulyTaskTypeIds } },
        data: {
          active: false,
          notes:
            "Archived by July Easton import. Allergy Shots is not an active July generation role.",
        },
      });
    }

    const backgroundCategory = await tx.backgroundTaskCategory.upsert({
      where: { code: "EASTON_BACKGROUND" },
      update: {
        name: "Easton spreadsheet background obligations",
        description:
          "Archived weekly background-work totals superseded by shift-specific staffing requirements.",
        active: true,
      },
      create: {
        code: "EASTON_BACKGROUND",
        name: "Easton spreadsheet background obligations",
        description:
          "Archived weekly background-work totals superseded by shift-specific staffing requirements.",
        active: true,
        sortOrder: 5,
      },
    });
    const deactivatedBackgroundDefinitions =
      await tx.backgroundTaskDefinition.updateMany({
        where: {
          categoryId: backgroundCategory.id,
          notes: {
            startsWith:
              "Easton spreadsheet default: editable weekly obligation derived from Shifts + Hours.",
          },
        },
        data: {
          active: false,
          notes:
            "Archived by Easton import: spreadsheet background demand is now applied per shift block through staffing requirements.",
        },
      });

    await tx.shiftTemplate.updateMany({
      where: {
        name: {
          in: [
            "AM early",
            "AM regular",
            "PM early/long",
            "PM regular",
            "Saturday long/endoscopy",
            "Saturday shorter",
          ],
        },
      },
      data: {
        active: false,
        notes:
          "Deactivated by Easton defaults because the workbook now owns final shift times.",
      },
    });

    const shiftTemplateIdByKey = new Map<string, string>();

    for (const shift of preview.shifts.filter(
      (item) => item.sheetName === "Shifts + Hours",
    )) {
      const name = eastonShiftTemplateName(shift);
      const existing = await tx.shiftTemplate.findFirst({ where: { name } });
      const data = eastonShiftTemplateDataFromShift(shift);
      const record = existing
        ? await tx.shiftTemplate.update({ where: { id: existing.id }, data })
        : await tx.shiftTemplate.create({ data });

      shiftTemplateIdByKey.set(shiftKey(shift), record.id);
    }

    await tx.staffingRequirementRule.deleteMany({
      where: { notes: { startsWith: EASTON_STAFFING_NOTE } },
    });

    let staffingRuleCount = 0;
    let backgroundStaffingRuleCount = 0;

    for (const demand of preview.roleDemand.filter(
      (item) => item.sheetName === "Shifts + Hours" && !item.aggregate,
    )) {
      if (isDeprecatedEastonJulyRoleCode(demand.roleCode)) {
        continue;
      }

      const taskTypeId = taskTypeByCode.get(demand.roleCode);
      const shiftTemplateId = shiftTemplateIdByKey.get(
        shiftDemandKey(demand.weekday, demand.startMinute, demand.endMinute, demand.paidHours),
      );
      const count = Math.max(0, Math.round(demand.count));

      if (!taskTypeId || !shiftTemplateId || count <= 0) {
        continue;
      }

      const required = REQUIRED_ROLE_CODES.has(demand.roleCode);
      const background = BACKGROUND_ROLE_CODES.has(demand.roleCode);

      await tx.staffingRequirementRule.create({
        data: {
          taskTypeId,
          shiftTemplateId,
          shiftCategory: demand.roleCode === "ENDOSCOPY" ? "ENDO" : null,
          weekday: demand.weekday,
          scenario: "ROUTINE",
          minRequiredSlots: required ? count : 0,
          desiredSlots: count,
          maxSlots: count,
          requirementLevel: required ? "REQUIRED" : "DESIRED",
          active: true,
          createdByEmployeeId: input.actorEmployeeId ?? null,
          notes: `${EASTON_STAFFING_NOTE} ${background ? "background " : ""}${demand.roleName} count ${count} for ${demand.shiftLabel}.`,
        },
      });
      staffingRuleCount += 1;
      backgroundStaffingRuleCount += background ? 1 : 0;
    }

    await tx.shortageRule.deleteMany({
      where: { notes: { startsWith: EASTON_SHORTAGE_NOTE } },
    });

    for (const rule of SHORTAGE_DEFAULTS) {
      await tx.shortageRule.create({
        data: {
          taskTypeId: taskTypeByCode.get(rule.taskCode) ?? null,
          closurePriority: rule.priority,
          managerInstruction: rule.instruction,
          active: true,
          createdByEmployeeId: input.actorEmployeeId ?? null,
          notes: `${EASTON_SHORTAGE_NOTE} seeded closure/pull order.`,
        },
      });
    }

    const workPatternIdByCode = new Map<string, string>();

    await tx.workPattern.updateMany({
      where: {
        code: {
          in: [
            "EASTON_ENDOSCOPY_SATURDAY",
            "EASTON_NON_ENDOSCOPY_SATURDAY",
          ],
        },
      },
      data: {
        active: false,
        notes:
          "Archived by July Easton import. Use the exact July group patterns imported from the active Shifts by GY target sheet.",
      },
    });

    for (const group of eastonWorkPatternGroups()) {
      const record = await tx.workPattern.upsert({
        where: { code: group.code },
        update: {
          name: group.name,
          kind: group.kind,
          targetWeeklyHours: 40,
          worksTuesdayThroughSaturday: group.requiredSaturdayShiftCategory === "ENDO",
          saturdayPaidHours: group.saturdayPaidHours,
          requiredSaturdayShiftCategory: group.requiredSaturdayShiftCategory,
          extraHourWeekdays: group.extraHourWeekdays as Prisma.InputJsonArray,
          mondayOffAllowed: group.requiredSaturdayShiftCategory === "SATURDAY",
          fridayOffAllowed: group.requiredSaturdayShiftCategory === "SATURDAY",
          earlyStartDaysPerWeek: group.extraHourWeekdays.length,
          active: true,
          notes: `${EASTON_STAFFING_NOTE} ${group.notes}`,
        },
        create: {
          code: group.code,
          name: group.name,
          kind: group.kind,
          targetWeeklyHours: 40,
          worksTuesdayThroughSaturday: group.requiredSaturdayShiftCategory === "ENDO",
          saturdayPaidHours: group.saturdayPaidHours,
          requiredSaturdayShiftCategory: group.requiredSaturdayShiftCategory,
          extraHourWeekdays: group.extraHourWeekdays as Prisma.InputJsonArray,
          mondayOffAllowed: group.requiredSaturdayShiftCategory === "SATURDAY",
          fridayOffAllowed: group.requiredSaturdayShiftCategory === "SATURDAY",
          earlyStartDaysPerWeek: group.extraHourWeekdays.length,
          active: true,
          notes: `${EASTON_STAFFING_NOTE} ${group.notes}`,
          createdByEmployeeId: input.actorEmployeeId ?? null,
        },
      });

      workPatternIdByCode.set(group.code, record.id);
    }

    const skippedPullNames: string[] = [];

    for (const pullDefault of BACKGROUND_PULL_DEFAULTS) {
      const employee = await tx.employee.findFirst({
        where: {
          fullName: { equals: pullDefault.name, mode: "insensitive" },
          status: "ACTIVE",
        },
      });

      if (!employee) {
        skippedPullNames.push(pullDefault.name);
        continue;
      }

      await tx.backgroundPullRule.upsert({
        where: { employeeId: employee.id },
        update: {
          priorityRank: pullDefault.priorityRank,
          maxPullsPerPeriod: pullDefault.maxPullsPerPeriod,
          active: true,
          notes: "Easton default: employee-specific pull priority for pullable background work.",
        },
        create: {
          employeeId: employee.id,
          priorityRank: pullDefault.priorityRank,
          maxPullsPerPeriod: pullDefault.maxPullsPerPeriod,
          active: true,
          notes: "Easton default: employee-specific pull priority for pullable background work.",
          createdByEmployeeId: input.actorEmployeeId ?? null,
        },
      });
    }

    const legacyJunePattern = await tx.schedulePattern.findUnique({
      where: { code: "EASTON_JUNE_REFERENCE" },
      select: { id: true },
    });

    if (legacyJunePattern) {
      await tx.schedulePatternSlot.deleteMany({
        where: { patternId: legacyJunePattern.id },
      });
      await tx.schedulePattern.update({
        where: { id: legacyJunePattern.id },
        data: {
          active: false,
          description:
            "Legacy June reference pattern archived. July generation uses Shifts + Hours and Shifts by GY only.",
        },
      });
    }

    const pattern = await tx.schedulePattern.upsert({
      where: { code: "EASTON_JULY_ACTIVE_TARGETS" },
      update: {
        name: "Easton July active targets",
        description:
          `Active July scheduling model parsed from Shifts + Hours and ${preview.activeEmployeeTargetSheetName ?? "the active Shifts by GY target sheet"}. Contains employee targets only; it does not hardcode sample assignments.`,
        source: "EASTON_SPREADSHEET",
        active: true,
      },
      create: {
        code: "EASTON_JULY_ACTIVE_TARGETS",
        name: "Easton July active targets",
        description:
          `Active July scheduling model parsed from Shifts + Hours and ${preview.activeEmployeeTargetSheetName ?? "the active Shifts by GY target sheet"}. Contains employee targets only; it does not hardcode sample assignments.`,
        source: "EASTON_SPREADSHEET",
        active: true,
        createdByEmployeeId: input.actorEmployeeId ?? null,
      },
    });

    await tx.schedulePatternSlot.deleteMany({ where: { patternId: pattern.id } });
    await tx.employeeScheduleTarget.deleteMany({ where: { patternId: pattern.id } });

    const employees = await tx.employee.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, fullName: true },
    });
    const unmatchedTargetNames: string[] = [];

    for (const target of preview.employeeTargets) {
      const matchedEmployee = findEmployeeForEastonTarget(target, employees);
      const employeeId = matchedEmployee?.id ?? null;
      const workPatternId = target.workPatternCode
        ? workPatternIdByCode.get(target.workPatternCode) ?? null
        : null;

      if (
        !employeeId &&
        target.scheduleEligibility === "ACTIVE_SCHEDULED" &&
        hasMeaningfulEmployeeTarget(target)
      ) {
        unmatchedTargetNames.push(target.employeeName);
      }

      if (employeeId) {
        await tx.employee.update({
          where: { id: employeeId },
          data: eastonEmployeeProfileUpdateFromTarget(target, workPatternId),
        });
      }

      await tx.employeeScheduleTarget.create({
        data: {
          patternId: pattern.id,
          employeeId,
          employeeName: target.employeeName,
          periodLabel: "Easton July active model",
          workPatternCode: target.workPatternCode,
          activeTargetSheetName: target.activeTargetSheetName,
          scheduleEligibility: target.scheduleEligibility,
          scheduleEligibilityReason: target.scheduleEligibilityReason,
          requiredBackgroundAssignments: target.requiredBackgroundAssignments,
          extraHourWeekdays: target.extraHourWeekdays as Prisma.InputJsonArray,
          targetPatientShifts: target.targetPatientShifts,
          targetTotalHours: target.targetTotalHours,
          targetTaskCounts: target.targetTaskCounts as Prisma.InputJsonObject,
          exposureGoals: target.exposureGoals as Prisma.InputJsonArray,
          source: "EASTON_SPREADSHEET",
          notes:
            [
              target.roleLabel,
              target.groupLabel,
              target.scheduleEligibility !== "ACTIVE_SCHEDULED"
                ? target.scheduleEligibility
                : null,
              target.scheduleEligibilityReason,
              `Required BG ${target.requiredBackgroundAssignments}`,
            ]
              .filter(Boolean)
              .join(" | ") || null,
        },
      });
    }

    const review = await tx.eastonImportReview.create({
      data: {
        sourcePath: preview.workbookPath ?? "not-found",
        workbookModifiedAt: preview.workbookModifiedAt
          ? new Date(preview.workbookModifiedAt)
          : null,
        status: "APPLIED",
        summary: previewSummaryJson(preview),
        warnings: [
          "Allergy Shots is deprecated for July generation; historical records remain, but active generated July staffing uses GI, Allergy, and PCP patient-facing roles.",
          ...preview.warnings,
          ...skippedPullNames.map(
            (name) => `Skipped background pull rule for missing employee: ${name}`,
          ),
          ...unmatchedTargetNames.map(
            (name) => `Imported target row could not be linked to an active employee: ${name}`,
          ),
        ] as Prisma.InputJsonArray,
        createdByEmployeeId: input.actorEmployeeId ?? null,
        appliedAt: new Date(),
      },
    });

    return {
      reviewId: review.id,
      activeEmployeeTargetSheetName: preview.activeEmployeeTargetSheetName,
      shiftTemplateCount: shiftTemplateIdByKey.size,
      staffingRuleCount,
      backgroundStaffingRuleCount,
      deactivatedBackgroundDefinitionCount: deactivatedBackgroundDefinitions.count,
      shortageRuleCount: SHORTAGE_DEFAULTS.length,
      workPatternCount: workPatternIdByCode.size,
      skippedPullNames,
      unmatchedTargetNames,
      targetEligibilityCounts: countTargetEligibility(preview.employeeTargets),
      patternSlotCount: 0,
      employeeTargetCount: preview.employeeTargets.length,
    };
  }, {
    maxWait: 10_000,
    timeout: 60_000,
  });

  await writeAuditLog({
    actorEmployeeId: input.actorEmployeeId,
    action: "easton_import.defaults_applied",
    entityType: "EastonImportReview",
    entityId: result.reviewId,
    after: result,
  });

  return result;
}

function previewSummaryJson(preview: EastonWorkbookPreview) {
  return {
    workbookPath: preview.workbookPath,
    workbookModifiedAt: preview.workbookModifiedAt,
    activeEmployeeTargetSheetName: preview.activeEmployeeTargetSheetName,
    sheets: preview.sheets,
    shiftCount: preview.shifts.length,
    roleDemandCount: preview.roleDemand.length,
    employeeTargetCount: preview.employeeTargets.length,
    sampleAssignmentCount: preview.sampleAssignments.length,
    roleCodes: [...new Set(preview.roleDemand.map((item) => item.roleCode))].sort(),
    targetEligibilityCounts: countTargetEligibility(preview.employeeTargets),
  } satisfies Prisma.InputJsonObject;
}

function eastonShiftTemplateName(shift: EastonParsedShift) {
  return `${weekdayName(shift.weekday)} ${shift.label.replace("~", "-")}`;
}

function shiftKey(shift: Pick<EastonParsedShift, "weekday" | "startMinute" | "endMinute" | "paidHours">) {
  return shiftDemandKey(shift.weekday, shift.startMinute, shift.endMinute, shift.paidHours);
}

function shiftDemandKey(
  weekday: number,
  startMinute: number,
  endMinute: number,
  paidHours: number,
) {
  return `${weekday}:${startMinute}:${endMinute}:${paidHours}`;
}

function weekdayName(weekday: number) {
  return [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][weekday] ?? `Weekday ${weekday}`;
}

function hasMeaningfulEmployeeTarget(target: {
  scheduleEligibility?: string | null;
  workPatternCode?: string | null;
  requiredBackgroundAssignments: number;
  targetPatientShifts: number | null;
  targetTotalHours: number | null;
  targetTaskCounts: Record<string, number>;
  exposureGoals: string[];
}) {
  if (
    target.scheduleEligibility &&
    target.scheduleEligibility !== "ACTIVE_SCHEDULED"
  ) {
    return false;
  }

  return (
    Boolean(target.workPatternCode) ||
    target.requiredBackgroundAssignments > 0 ||
    Number(target.targetPatientShifts ?? 0) > 0 ||
    Number(target.targetTotalHours ?? 0) > 0 ||
    target.exposureGoals.length > 0 ||
    Object.values(target.targetTaskCounts).some((value) => value > 0)
  );
}

export function isEastonBackgroundRole(roleCode: string) {
  return BACKGROUND_ROLE_CODES.has(normalizeEastonRoleCode(roleCode));
}

export function eastonEmployeeProfileUpdateFromTarget(
  target: Pick<
    EastonEmployeeTarget,
    "requiredBackgroundAssignments" | "scheduleEligibility"
  >,
  workPatternId: string | null,
) {
  if (target.scheduleEligibility !== "ACTIVE_SCHEDULED") {
    return {
      scheduleEligible: false,
      requiredWeeklyBackgroundShifts: 0,
      workPatternId: null,
    };
  }

  return {
    expectedWeeklyHours: 40,
    scheduleEligible: true,
    requiredWeeklyBackgroundShifts: target.requiredBackgroundAssignments,
    ...(workPatternId ? { workPatternId } : {}),
  };
}

function countTargetEligibility(targets: EastonEmployeeTarget[]) {
  return targets.reduce<Record<string, number>>((counts, target) => {
    counts[target.scheduleEligibility] =
      (counts[target.scheduleEligibility] ?? 0) + 1;
    return counts;
  }, {});
}

export function eastonShiftTemplateDataFromShift(shift: EastonParsedShift) {
  return {
    name: eastonShiftTemplateName(shift),
    dayOfWeek: shift.weekday,
    startMinute: shift.startMinute,
    endMinute: shift.endMinute,
    paidHours: shift.paidHours,
    shiftCategory: shift.shiftCategory,
    defaultForSchedule: true,
    active: true,
    notes: `${EASTON_STAFFING_NOTE} source shift ${shift.dayLabel} ${shift.label}.`,
  };
}
