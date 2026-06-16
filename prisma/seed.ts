import { PrismaClient } from "@prisma/client";
import { REQUIRED_CONFIGURABLE_SKILLS } from "../src/lib/skills/catalog";

const prisma = new PrismaClient();

const skills = [
  {
    code: "FRONT_BACKGROUND",
    name: "Front Background",
    description:
      "Legacy front-background-specific skill retained for older data. New front tasks use FRONT.",
  },
  {
    code: "CIVIL_SURGEON",
    name: "Civil Surgeon",
    description: "Required for Civil Surgeon staffing assignments.",
  },
  {
    code: "ALLERGY_SHOT",
    name: "Allergy Shot",
    description: "Required for Allergy Shots staffing assignments.",
  },
  {
    code: "PROCEDURE",
    name: "Procedure",
    description: "Required for procedure room staffing assignments.",
  },
  ...REQUIRED_CONFIGURABLE_SKILLS,
];

const taskTypes = [
  {
    code: "NEW_ALLERGY",
    name: "New Allergy",
    interchangeableGroup: "ALLERGY_NEW_VISIT",
    difficultyWeight: 1,
    sortOrder: 10,
    optional: false,
    defaultForRoutine: true,
    defaultForReduced: false,
    isClinical: true,
    isBackground: false,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: [],
  },
  {
    code: "VIRTUAL_ALLERGY",
    name: "Virtual Allergy",
    interchangeableGroup: "ALLERGY_NEW_VISIT",
    difficultyWeight: 1,
    sortOrder: 20,
    optional: false,
    defaultForRoutine: true,
    defaultForReduced: false,
    isClinical: true,
    isBackground: false,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: [],
  },
  {
    code: "NEW_GI",
    name: "New GI",
    interchangeableGroup: "GI_NEW_VISIT",
    difficultyWeight: 1,
    sortOrder: 30,
    optional: false,
    defaultForRoutine: true,
    defaultForReduced: false,
    isClinical: true,
    isBackground: false,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: [],
  },
  {
    code: "VIRTUAL_GI",
    name: "Virtual GI",
    interchangeableGroup: "GI_NEW_VISIT",
    difficultyWeight: 1,
    sortOrder: 40,
    optional: false,
    defaultForRoutine: true,
    defaultForReduced: false,
    isClinical: true,
    isBackground: false,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: [],
  },
  {
    code: "FOLLOWUP",
    name: "Followup",
    interchangeableGroup: null,
    difficultyWeight: 0,
    sortOrder: 50,
    optional: false,
    defaultForRoutine: true,
    defaultForReduced: true,
    isClinical: true,
    isBackground: false,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: [],
  },
  {
    code: "PCP",
    name: "PCP",
    interchangeableGroup: null,
    difficultyWeight: 0,
    sortOrder: 55,
    optional: false,
    defaultForRoutine: false,
    defaultForReduced: false,
    isClinical: true,
    isBackground: false,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: [],
  },
  {
    code: "FRONT_DESK",
    name: "Front Desk",
    interchangeableGroup: null,
    difficultyWeight: 0,
    sortOrder: 60,
    optional: false,
    defaultForRoutine: true,
    defaultForReduced: true,
    isClinical: false,
    isBackground: false,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: ["FRONT"],
  },
  {
    code: "FRONT_BACKGROUND",
    name: "Front Background",
    interchangeableGroup: null,
    difficultyWeight: 0,
    sortOrder: 65,
    optional: true,
    defaultForRoutine: false,
    defaultForReduced: false,
    isClinical: false,
    isBackground: true,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: ["FRONT"],
  },
  {
    code: "CIVIL_SURGEON",
    name: "Civil Surgeon",
    interchangeableGroup: null,
    difficultyWeight: 2,
    sortOrder: 70,
    optional: false,
    defaultForRoutine: true,
    defaultForReduced: false,
    isClinical: true,
    isBackground: false,
    isSkilled: true,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: ["CIVIL_SURGEON"],
  },
  {
    code: "ALLERGY_SHOTS",
    name: "Allergy Shots",
    interchangeableGroup: null,
    difficultyWeight: 2,
    sortOrder: 80,
    optional: true,
    defaultForRoutine: false,
    defaultForReduced: false,
    isClinical: true,
    isBackground: false,
    isSkilled: true,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: ["ALLERGY_SHOT"],
  },
  {
    code: "PROCEDURE",
    name: "Procedure",
    interchangeableGroup: null,
    difficultyWeight: 3,
    sortOrder: 90,
    optional: false,
    defaultForRoutine: true,
    defaultForReduced: false,
    isClinical: true,
    isBackground: false,
    isSkilled: true,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: ["PROCEDURE"],
  },
  {
    code: "ENDOSCOPY",
    name: "Endoscopy",
    interchangeableGroup: null,
    difficultyWeight: 3,
    sortOrder: 95,
    optional: false,
    defaultForRoutine: false,
    defaultForReduced: false,
    isClinical: true,
    isBackground: false,
    isSkilled: true,
    isEndoscopy: true,
    isFloat: false,
    requiredSkillCodes: ["PROCEDURE"],
  },
  {
    code: "CLINICAL_A",
    name: "Clinical A",
    interchangeableGroup: null,
    difficultyWeight: 1,
    sortOrder: 96,
    optional: false,
    defaultForRoutine: false,
    defaultForReduced: false,
    isClinical: true,
    isBackground: false,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: [],
  },
  {
    code: "CLINICAL_B",
    name: "Clinical B",
    interchangeableGroup: null,
    difficultyWeight: 1,
    sortOrder: 97,
    optional: false,
    defaultForRoutine: false,
    defaultForReduced: false,
    isClinical: true,
    isBackground: false,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: [],
  },
  {
    code: "IT",
    name: "IT",
    interchangeableGroup: null,
    difficultyWeight: 1,
    sortOrder: 98,
    optional: false,
    defaultForRoutine: false,
    defaultForReduced: false,
    isClinical: true,
    isBackground: false,
    isSkilled: true,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: ["IT"],
  },
  {
    code: "PRIOR_AUTHORIZATION",
    name: "PA / Prior Authorization",
    interchangeableGroup: null,
    difficultyWeight: 1,
    sortOrder: 99,
    optional: true,
    defaultForRoutine: false,
    defaultForReduced: false,
    isClinical: false,
    isBackground: true,
    isSkilled: true,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: ["PRIOR_AUTHORIZATION"],
  },
  {
    code: "PHYSICIAN_ASSISTANT_MD",
    name: "Physician Assistant / MD",
    interchangeableGroup: null,
    difficultyWeight: 2,
    sortOrder: 100,
    optional: false,
    defaultForRoutine: false,
    defaultForReduced: false,
    isClinical: true,
    isBackground: false,
    isSkilled: true,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: [],
  },
  {
    code: "RESEARCH",
    name: "Research",
    interchangeableGroup: null,
    difficultyWeight: 0,
    sortOrder: 110,
    optional: true,
    defaultForRoutine: false,
    defaultForReduced: false,
    isClinical: false,
    isBackground: true,
    isSkilled: true,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: ["RESEARCH"],
  },
  {
    code: "BACKGROUND",
    name: "Background",
    interchangeableGroup: null,
    difficultyWeight: 0,
    sortOrder: 120,
    optional: true,
    defaultForRoutine: false,
    defaultForReduced: false,
    isClinical: false,
    isBackground: true,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: [],
  },
  {
    code: "BOOKING",
    name: "Booking",
    interchangeableGroup: null,
    difficultyWeight: 0,
    sortOrder: 130,
    optional: true,
    defaultForRoutine: false,
    defaultForReduced: false,
    isClinical: false,
    isBackground: true,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: [],
  },
  {
    code: "FLOAT",
    name: "Float",
    interchangeableGroup: null,
    difficultyWeight: 0,
    sortOrder: 140,
    optional: true,
    defaultForRoutine: false,
    defaultForReduced: false,
    isClinical: false,
    isBackground: true,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: true,
    requiredSkillCodes: [],
  },
  {
    code: "EXTRA",
    name: "Extra",
    interchangeableGroup: null,
    difficultyWeight: 0,
    sortOrder: 150,
    optional: true,
    defaultForRoutine: false,
    defaultForReduced: false,
    isClinical: false,
    isBackground: true,
    isSkilled: false,
    isEndoscopy: false,
    isFloat: false,
    requiredSkillCodes: [],
  },
];

const shiftTemplates = [
  {
    name: "Monday 0700-1200 (5)",
    dayOfWeek: 1,
    startMinute: 7 * 60,
    endMinute: 12 * 60,
    paidHours: 5,
    shiftCategory: "AM" as const,
    defaultForSchedule: true,
    notes: "Seed: Easton spreadsheet Monday 0700-1200 shift.",
  },
  {
    name: "Monday 0800-1200 (4)",
    dayOfWeek: 1,
    startMinute: 8 * 60,
    endMinute: 12 * 60,
    paidHours: 4,
    shiftCategory: "AM" as const,
    defaultForSchedule: true,
    notes: "Seed: Easton spreadsheet Monday 0800-1200 shift.",
  },
  {
    name: "Monday 1300-1800 (5)",
    dayOfWeek: 1,
    startMinute: 13 * 60,
    endMinute: 18 * 60,
    paidHours: 5,
    shiftCategory: "PM" as const,
    defaultForSchedule: true,
    notes: "Seed: Easton spreadsheet Monday 1300-1800 shift.",
  },
  {
    name: "Monday 1300-1700 (4)",
    dayOfWeek: 1,
    startMinute: 13 * 60,
    endMinute: 17 * 60,
    paidHours: 4,
    shiftCategory: "PM" as const,
    defaultForSchedule: true,
    notes: "Seed: Easton spreadsheet Monday 1300-1700 shift.",
  },
  ...[2, 3, 4].flatMap((weekday) => [
    {
      name: `${weekdayName(weekday)} 0700-1200 (5)`,
      dayOfWeek: weekday,
      startMinute: 7 * 60,
      endMinute: 12 * 60,
      paidHours: 5,
      shiftCategory: "AM" as const,
      defaultForSchedule: true,
      notes: `Seed: Easton spreadsheet ${weekdayName(weekday)} 0700-1200 shift.`,
    },
    {
      name: `${weekdayName(weekday)} 0800-1200 (4)`,
      dayOfWeek: weekday,
      startMinute: 8 * 60,
      endMinute: 12 * 60,
      paidHours: 4,
      shiftCategory: "AM" as const,
      defaultForSchedule: true,
      notes: `Seed: Easton spreadsheet ${weekdayName(weekday)} 0800-1200 shift.`,
    },
    {
      name: `${weekdayName(weekday)} 1300-1700 (4)`,
      dayOfWeek: weekday,
      startMinute: 13 * 60,
      endMinute: 17 * 60,
      paidHours: 4,
      shiftCategory: "PM" as const,
      defaultForSchedule: true,
      notes: `Seed: Easton spreadsheet ${weekdayName(weekday)} 1300-1700 shift.`,
    },
  ]),
  {
    name: "Friday 0800-1200 (4)",
    dayOfWeek: 5,
    startMinute: 8 * 60,
    endMinute: 12 * 60,
    paidHours: 4,
    shiftCategory: "AM" as const,
    defaultForSchedule: true,
    notes: "Seed: Easton spreadsheet Friday 0800-1200 shift.",
  },
  {
    name: "Friday 1300-1700 (4)",
    dayOfWeek: 5,
    startMinute: 13 * 60,
    endMinute: 17 * 60,
    paidHours: 4,
    shiftCategory: "PM" as const,
    defaultForSchedule: true,
    notes: "Seed: Easton spreadsheet Friday 1300-1700 shift.",
  },
  {
    name: "Saturday 0600-1400 (8)",
    dayOfWeek: 6,
    startMinute: 6 * 60,
    endMinute: 14 * 60,
    paidHours: 8,
    shiftCategory: "ENDO" as const,
    defaultForSchedule: true,
    notes: "Seed: Easton spreadsheet Saturday 0600-1400 endoscopy shift.",
  },
  {
    name: "Saturday 0800-1400 (6)",
    dayOfWeek: 6,
    startMinute: 8 * 60,
    endMinute: 14 * 60,
    paidHours: 6,
    shiftCategory: "SATURDAY" as const,
    defaultForSchedule: true,
    notes: "Seed: Easton spreadsheet Saturday 0800-1400 shift.",
  },
];

function weekdayName(weekday: number) {
  return [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][weekday];
}

function weekdayWindows(
  weekdays: number[],
  startMinute = 8 * 60,
  endMinute = 17 * 60,
) {
  return weekdays.map((weekday) => ({
    weekday,
    startMinute,
    endMinute,
  }));
}

const demoEmployees = [
  {
    email: "ava.allergy@clinic.test",
    fullName: "Ava Allergy",
    role: "ADMIN" as const,
    skillCodes: ["ALLERGY_SHOT", "IT"],
    ptoBalanceHours: 80,
    expectedWeeklyHours: 40,
    weeklyAssignmentLimit: 5,
    availability: weekdayWindows([1, 2, 3, 4, 5]),
  },
  {
    email: "ben.frontdesk@clinic.test",
    fullName: "Ben Front Desk",
    role: "MANAGER" as const,
    skillCodes: ["PRIOR_AUTHORIZATION"],
    ptoBalanceHours: 64,
    expectedWeeklyHours: 40,
    weeklyAssignmentLimit: 5,
    availability: weekdayWindows([2, 3, 4, 5, 6]),
  },
  {
    email: "cora.civil@clinic.test",
    fullName: "Cora Civil",
    role: "EMPLOYEE" as const,
    skillCodes: ["CIVIL_SURGEON"],
    ptoBalanceHours: 72,
    expectedWeeklyHours: 40,
    weeklyAssignmentLimit: 5,
    availability: weekdayWindows([1, 2, 3, 4, 5], 7 * 60, 17 * 60),
  },
  {
    email: "dev.procedure@clinic.test",
    fullName: "Dev Procedure",
    role: "EMPLOYEE" as const,
    skillCodes: ["PROCEDURE"],
    ptoBalanceHours: 56,
    expectedWeeklyHours: 40,
    weeklyAssignmentLimit: 5,
    availability: weekdayWindows([1, 2, 3, 4, 5], 8 * 60, 18 * 60),
  },
  {
    email: "ella.float@clinic.test",
    fullName: "Ella Float",
    role: "EMPLOYEE" as const,
    skillCodes: ["ALLERGY_SHOT", "PROCEDURE"],
    ptoBalanceHours: 48,
    expectedWeeklyHours: 40,
    weeklyAssignmentLimit: 5,
    availability: weekdayWindows([2, 3, 4, 5, 6]),
  },
  {
    email: "finn.gi@clinic.test",
    fullName: "Finn GI",
    role: "EMPLOYEE" as const,
    skillCodes: ["RESEARCH"],
    ptoBalanceHours: 60,
    expectedWeeklyHours: 32,
    weeklyAssignmentLimit: 5,
    availability: weekdayWindows([1, 2, 4, 5]),
  },
  {
    email: "gia.followup@clinic.test",
    fullName: "Gia Followup",
    role: "EMPLOYEE" as const,
    skillCodes: [],
    ptoBalanceHours: 40,
    expectedWeeklyHours: 40,
    weeklyAssignmentLimit: 5,
    availability: weekdayWindows([1, 3, 4, 5, 6]),
  },
  {
    email: "hugo.virtual@clinic.test",
    fullName: "Hugo Virtual",
    role: "EMPLOYEE" as const,
    skillCodes: [],
    ptoBalanceHours: 52,
    expectedWeeklyHours: 40,
    weeklyAssignmentLimit: 5,
    availability: weekdayWindows([2, 3, 4, 5, 6]),
  },
  {
    email: "ivy.backup@clinic.test",
    fullName: "Ivy Backup",
    role: "EMPLOYEE" as const,
    skillCodes: ["CIVIL_SURGEON", "ALLERGY_SHOT"],
    ptoBalanceHours: 44,
    expectedWeeklyHours: 40,
    weeklyAssignmentLimit: 5,
    availability: weekdayWindows([1, 2, 3, 5, 6]),
  },
];

const nonPatientFacingTaskCodes = new Set([
  "PRIOR_AUTHORIZATION",
  "RESEARCH",
  "BACKGROUND",
  "BOOKING",
  "FLOAT",
  "EXTRA",
  "FRONT_BACKGROUND",
]);

const closureCandidateTaskCodes = new Set([
  "FLOAT",
  "BACKGROUND",
  "BOOKING",
  "FRONT_BACKGROUND",
  "IT",
  "CIVIL_SURGEON",
]);

async function main() {
  await prisma.timeOffSettings.upsert({
    where: { id: "default" },
    update: { nptoCapHours: 240 },
    create: { id: "default", nptoCapHours: 240 },
  });

  await prisma.payrollSettings.upsert({
    where: { id: "default" },
    update: {
      defaultPayrollPeriodDays: 14,
      fullTimeWeeklyHours: 40,
      paidHolidayDefaultHours: 8,
      endoscopyExtraHoursPolicy: "BANK_PTO",
      endoscopyShortenShiftSuggestions: false,
    },
    create: {
      id: "default",
      defaultPayrollPeriodDays: 14,
      fullTimeWeeklyHours: 40,
      paidHolidayDefaultHours: 8,
      endoscopyExtraHoursPolicy: "BANK_PTO",
      endoscopyShortenShiftSuggestions: false,
    },
  });

  await prisma.fairnessSetting.upsert({
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
        "Seed: Easton-style configurable fairness defaults.",
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
        "Seed: Easton-style configurable fairness defaults.",
    },
  });

  const skillByCode = new Map<string, string>();
  const taskTypeByCode = new Map<string, string>();
  let demoAdminId: string | null = null;

  for (const skill of skills) {
    const record = await prisma.skill.upsert({
      where: { code: skill.code },
      update: {
        name: skill.name,
        description: skill.description,
        active: true,
      },
      create: {
        code: skill.code,
        name: skill.name,
        description: skill.description,
      },
    });

    skillByCode.set(record.code, record.id);
  }

  for (const taskType of taskTypes) {
    const record = await prisma.taskType.upsert({
      where: { code: taskType.code },
      update: {
        name: taskType.name,
        interchangeableGroup: taskType.interchangeableGroup,
        difficultyWeight: taskType.difficultyWeight,
        sortOrder: taskType.sortOrder,
        optional: taskType.optional,
        defaultForRoutine: taskType.defaultForRoutine,
        defaultForReduced: taskType.defaultForReduced,
        isPatientFacing: !nonPatientFacingTaskCodes.has(taskType.code),
        isClinical: taskType.isClinical,
        isBackground: taskType.isBackground,
        isSkilled: taskType.isSkilled,
        isEndoscopy: taskType.isEndoscopy,
        isFloat: taskType.isFloat,
        isClosureCandidate: closureCandidateTaskCodes.has(taskType.code),
        active: taskType.code !== "ALLERGY_SHOTS",
      },
      create: {
        code: taskType.code,
        name: taskType.name,
        interchangeableGroup: taskType.interchangeableGroup,
        difficultyWeight: taskType.difficultyWeight,
        sortOrder: taskType.sortOrder,
        optional: taskType.optional,
        defaultForRoutine: taskType.defaultForRoutine,
        defaultForReduced: taskType.defaultForReduced,
        isPatientFacing: !nonPatientFacingTaskCodes.has(taskType.code),
        isClinical: taskType.isClinical,
        isBackground: taskType.isBackground,
        isSkilled: taskType.isSkilled,
        isEndoscopy: taskType.isEndoscopy,
        isFloat: taskType.isFloat,
        isClosureCandidate: closureCandidateTaskCodes.has(taskType.code),
        active: taskType.code !== "ALLERGY_SHOTS",
      },
    });

    for (const skillCode of taskType.requiredSkillCodes) {
      const skillId = skillByCode.get(skillCode);
      if (!skillId) {
        throw new Error(`Missing seed skill: ${skillCode}`);
      }

      await prisma.taskSkillRequirement.upsert({
        where: {
          taskTypeId_skillId: {
            taskTypeId: record.id,
            skillId,
          },
        },
        update: { required: true },
        create: {
          taskTypeId: record.id,
          skillId,
          required: true,
        },
      });
    }

    taskTypeByCode.set(record.code, record.id);
  }

  for (const shiftTemplate of shiftTemplates) {
    const existing = await prisma.shiftTemplate.findFirst({
      where: { name: shiftTemplate.name },
    });

    if (existing) {
      await prisma.shiftTemplate.update({
        where: { id: existing.id },
        data: {
          ...shiftTemplate,
          active: true,
        },
      });
    } else {
      await prisma.shiftTemplate.create({
        data: {
          ...shiftTemplate,
          active: true,
        },
      });
    }
  }

  const backgroundCategoryByCode = new Map<string, string>();

  for (const category of [
    {
      code: "ADMIN_OPS",
      name: "Admin Operations",
      description: "Non-clinic administrative work obligations.",
      sortOrder: 10,
    },
    {
      code: "RESEARCH",
      name: "Research",
      description: "Research and study support obligations.",
      sortOrder: 20,
    },
    {
      code: "BOOKING",
      name: "Booking",
      description: "Booking and scheduling support obligations.",
      sortOrder: 30,
    },
  ]) {
    const record = await prisma.backgroundTaskCategory.upsert({
      where: { code: category.code },
      update: {
        name: category.name,
        description: category.description,
        sortOrder: category.sortOrder,
        active: true,
      },
      create: {
        ...category,
        active: true,
      },
    });

    backgroundCategoryByCode.set(record.code, record.id);
  }

  for (const definition of [
    {
      categoryCode: "ADMIN_OPS",
      taskTypeCode: "IT",
      name: "IT support",
      estimatedHoursPerPeriod: 4,
      requiredCountPerPeriod: 1,
      priority: 80,
    },
    {
      categoryCode: "ADMIN_OPS",
      taskTypeCode: "PRIOR_AUTHORIZATION",
      name: "Prior authorization",
      estimatedHoursPerPeriod: 4,
      requiredCountPerPeriod: 1,
      priority: 70,
    },
    {
      categoryCode: "RESEARCH",
      taskTypeCode: "RESEARCH",
      name: "Research",
      estimatedHoursPerPeriod: 4,
      requiredCountPerPeriod: 1,
      priority: 100,
    },
    {
      categoryCode: "BOOKING",
      taskTypeCode: "BOOKING",
      name: "Booking",
      estimatedHoursPerPeriod: 4,
      requiredCountPerPeriod: 1,
      priority: 90,
    },
  ]) {
    const categoryId = backgroundCategoryByCode.get(definition.categoryCode);
    const taskTypeId = taskTypeByCode.get(definition.taskTypeCode);

    if (!categoryId || !taskTypeId) {
      continue;
    }

    const existing = await prisma.backgroundTaskDefinition.findFirst({
      where: { categoryId, name: definition.name },
    });
    const data = {
      categoryId,
      taskTypeId,
      name: definition.name,
      estimatedHoursPerPeriod: definition.estimatedHoursPerPeriod,
      requiredCountPerPeriod: definition.requiredCountPerPeriod,
      periodType: "WEEKLY" as const,
      priority: definition.priority,
      canBePulledForClinic: true,
      protectedFromPull: false,
      rolloverAllowed: true,
      active: true,
      notes: "Seed: editable weekly background-task generation example.",
      createdByEmployeeId: demoAdminId,
    };

    if (existing) {
      await prisma.backgroundTaskDefinition.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.backgroundTaskDefinition.create({ data });
    }
  }

  await prisma.taskType.updateMany({
    where: { code: "PROCEDURES" },
    data: {
      active: false,
      defaultForRoutine: false,
      defaultForReduced: false,
    },
  });

  for (const employee of demoEmployees) {
    const record = await prisma.employee.upsert({
      where: { email: employee.email },
      update: {
        fullName: employee.fullName,
        role: employee.role,
        status: "ACTIVE",
        ptoBalanceHours: employee.ptoBalanceHours,
        expectedWeeklyHours: employee.expectedWeeklyHours,
        weeklyAssignmentLimit: employee.weeklyAssignmentLimit,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
      },
      create: {
        email: employee.email,
        fullName: employee.fullName,
        role: employee.role,
        status: "ACTIVE",
        ptoBalanceHours: employee.ptoBalanceHours,
        expectedWeeklyHours: employee.expectedWeeklyHours,
        weeklyAssignmentLimit: employee.weeklyAssignmentLimit,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    await prisma.employeeSkill.deleteMany({
      where: { employeeId: record.id },
    });

    for (const skillCode of employee.skillCodes) {
      const skillId = skillByCode.get(skillCode);
      if (!skillId) {
        throw new Error(`Missing employee seed skill: ${skillCode}`);
      }

      await prisma.employeeSkill.create({
        data: {
          employeeId: record.id,
          skillId,
        },
      });
    }

    await prisma.weeklyAvailability.deleteMany({
      where: { employeeId: record.id },
    });

    await prisma.weeklyAvailability.createMany({
      data: employee.availability.map((window) => ({
        employeeId: record.id,
        weekday: window.weekday,
        startMinute: window.startMinute,
        endMinute: window.endMinute,
        effectiveStartDate: new Date("2026-01-01T00:00:00.000Z"),
      })),
    });

    if (employee.role === "ADMIN" && demoAdminId === null) {
      demoAdminId = record.id;
    }
  }

  await prisma.workPattern.upsert({
    where: { code: "EASTON_ENDOSCOPY_SATURDAY" },
    update: {
      name: "Endoscopy Saturday pattern",
      kind: "ENDOSCOPY_SATURDAY",
      targetWeeklyHours: 40,
      worksTuesdayThroughSaturday: true,
      saturdayPaidHours: 8,
      mondayOffAllowed: true,
      fridayOffAllowed: false,
      earlyStartDaysPerWeek: 0,
      active: false,
      notes:
        "Seed archive: legacy generic Easton pattern. Use exact July group patterns from Shifts by GY.",
    },
    create: {
      code: "EASTON_ENDOSCOPY_SATURDAY",
      name: "Endoscopy Saturday pattern",
      kind: "ENDOSCOPY_SATURDAY",
      targetWeeklyHours: 40,
      worksTuesdayThroughSaturday: true,
      saturdayPaidHours: 8,
      mondayOffAllowed: true,
      fridayOffAllowed: false,
      earlyStartDaysPerWeek: 0,
      active: false,
      notes:
        "Seed archive: legacy generic Easton pattern. Use exact July group patterns from Shifts by GY.",
      createdByEmployeeId: demoAdminId,
    },
  });

  await prisma.workPattern.upsert({
    where: { code: "EASTON_NON_ENDOSCOPY_SATURDAY" },
    update: {
      name: "Non-endoscopy Saturday pattern",
      kind: "NON_ENDOSCOPY_SATURDAY",
      targetWeeklyHours: 40,
      worksTuesdayThroughSaturday: false,
      saturdayPaidHours: 6,
      mondayOffAllowed: true,
      fridayOffAllowed: true,
      earlyStartDaysPerWeek: 2,
      active: false,
      notes:
        "Seed archive: legacy generic Easton pattern. Use exact July group patterns from Shifts by GY.",
    },
    create: {
      code: "EASTON_NON_ENDOSCOPY_SATURDAY",
      name: "Non-endoscopy Saturday pattern",
      kind: "NON_ENDOSCOPY_SATURDAY",
      targetWeeklyHours: 40,
      worksTuesdayThroughSaturday: false,
      saturdayPaidHours: 6,
      mondayOffAllowed: true,
      fridayOffAllowed: true,
      earlyStartDaysPerWeek: 2,
      active: false,
      notes:
        "Seed archive: legacy generic Easton pattern. Use exact July group patterns from Shifts by GY.",
      createdByEmployeeId: demoAdminId,
    },
  });

  await prisma.shortageRule.deleteMany({
    where: {
      notes: {
        startsWith: "Seed: Easton closure order",
      },
    },
  });

  for (const shortage of [
    ["FLOAT", 1, "First pull from Float assignments before reducing clinic coverage."],
    [
      "BACKGROUND",
      2,
      "Then pull from non-essential Background work that is marked pullable.",
    ],
    ["BOOKING", 3, "Then pull from Booking if the task is not protected."],
    ["FRONT_BACKGROUND", 4, "Then pull from Front Background support."],
    ["IT", 5, "Then consider pulling IT and closing shots only with manager review."],
    [
      "NEW_ALLERGY",
      6,
      "Then consider cutting the 4th allergy person and using a 3-gap-year allergy round robin.",
    ],
    [
      "CIVIL_SURGEON",
      7,
      "Civil is the last closure candidate and requires explicit manager review.",
    ],
  ] as const) {
    const [taskCode, closurePriority, managerInstruction] = shortage;
    const taskTypeId = taskTypeByCode.get(taskCode);

    await prisma.shortageRule.create({
      data: {
        taskTypeId,
        closurePriority,
        managerInstruction,
        active: true,
        createdByEmployeeId: demoAdminId,
        notes: "Seed: Easton closure order from scheduling prompt.",
      },
    });
  }

  const skippedPullPriorityNames: string[] = [];

  for (const pullDefault of [
    { name: "Yvonne", priorityRank: 1, maxPullsPerPeriod: null },
    { name: "Katie", priorityRank: 2, maxPullsPerPeriod: 1 },
    { name: "Hanna", priorityRank: 3, maxPullsPerPeriod: 1 },
    { name: "Easton", priorityRank: 4, maxPullsPerPeriod: 2 },
    { name: "Angela", priorityRank: 5, maxPullsPerPeriod: 1 },
    { name: "Nicole", priorityRank: 6, maxPullsPerPeriod: 1 },
    { name: "Vicky", priorityRank: 7, maxPullsPerPeriod: 1 },
    { name: "Iris", priorityRank: 8, maxPullsPerPeriod: 1 },
    { name: "Kodhai", priorityRank: 9, maxPullsPerPeriod: 1 },
  ]) {
    const employee = await prisma.employee.findFirst({
      where: {
        fullName: { equals: pullDefault.name, mode: "insensitive" },
        status: "ACTIVE",
      },
    });

    if (!employee) {
      skippedPullPriorityNames.push(pullDefault.name);
      continue;
    }

    await prisma.backgroundPullRule.upsert({
      where: { employeeId: employee.id },
      update: {
        priorityRank: pullDefault.priorityRank,
        maxPullsPerPeriod: pullDefault.maxPullsPerPeriod,
        active: true,
        notes: "Seed: Easton background pull priority.",
      },
      create: {
        employeeId: employee.id,
        priorityRank: pullDefault.priorityRank,
        maxPullsPerPeriod: pullDefault.maxPullsPerPeriod,
        active: true,
        notes: "Seed: Easton background pull priority.",
        createdByEmployeeId: demoAdminId,
      },
    });
  }

  if (skippedPullPriorityNames.length > 0) {
    console.info(
      `Skipped Easton pull-priority names not found in seed database: ${skippedPullPriorityNames.join(", ")}`,
    );
  }

  await prisma.staffingRequirementRule.deleteMany({
    where: {
      notes: {
        startsWith: "Seed:",
      },
    },
  });

  const allergyShotsId = taskTypeByCode.get("ALLERGY_SHOTS");
  const procedureId = taskTypeByCode.get("PROCEDURE");

  if (allergyShotsId) {
    await prisma.staffingRequirementRule.create({
      data: {
        taskTypeId: allergyShotsId,
        weekday: 6,
        scenario: "ROUTINE",
        minRequiredSlots: 1,
        desiredSlots: 2,
        maxSlots: 2,
        requirementLevel: "DESIRED",
        active: false,
        createdByEmployeeId: demoAdminId,
        notes:
          "Seed archive: Allergy Shots is deprecated for July generation and remains only for historical/manual review.",
      },
    });
  }

  if (procedureId) {
    await prisma.staffingRequirementRule.create({
      data: {
        taskTypeId: procedureId,
        scenario: "DOCTOR_OFF_REDUCED_STAFFING",
        minRequiredSlots: 0,
        desiredSlots: 0,
        maxSlots: 1,
        requirementLevel: "CONDITIONAL",
        active: true,
        createdByEmployeeId: demoAdminId,
        notes: "Seed: reduced staffing removes routine procedure slots unless added manually.",
      },
    });
  }

  for (const holiday of [
    {
      date: new Date("2026-07-04T00:00:00.000Z"),
      name: "Independence Day",
      hours: 8,
      notes: "Seed: example paid holiday for payroll report review.",
    },
    {
      date: new Date("2026-12-25T00:00:00.000Z"),
      name: "Christmas Day",
      hours: 8,
      notes: "Seed: example paid holiday for payroll report review.",
    },
  ]) {
    await prisma.paidHoliday.upsert({
      where: { date: holiday.date },
      update: {
        name: holiday.name,
        hours: holiday.hours,
        active: true,
        rule: "PAID_HOLIDAY",
        notes: holiday.notes,
        createdByEmployeeId: demoAdminId,
      },
      create: {
        ...holiday,
        rule: "PAID_HOLIDAY",
        createdByEmployeeId: demoAdminId,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
