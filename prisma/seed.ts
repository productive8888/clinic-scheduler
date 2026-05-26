import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const skills = [
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
    requiredSkillCodes: [],
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
    requiredSkillCodes: ["CIVIL_SURGEON"],
  },
  {
    code: "ALLERGY_SHOTS",
    name: "Allergy Shots",
    interchangeableGroup: null,
    difficultyWeight: 2,
    sortOrder: 80,
    optional: false,
    defaultForRoutine: true,
    defaultForReduced: true,
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
    requiredSkillCodes: [],
  },
  {
    code: "IT",
    name: "IT",
    interchangeableGroup: null,
    difficultyWeight: 0,
    sortOrder: 98,
    optional: false,
    defaultForRoutine: false,
    defaultForReduced: false,
    requiredSkillCodes: [],
  },
  {
    code: "PHYSICIAN_ASSISTANT_MD",
    name: "Physician Assistant / MD",
    interchangeableGroup: null,
    difficultyWeight: 2,
    sortOrder: 99,
    optional: false,
    defaultForRoutine: false,
    defaultForReduced: false,
    requiredSkillCodes: [],
  },
  {
    code: "RESEARCH",
    name: "Research",
    interchangeableGroup: null,
    difficultyWeight: 0,
    sortOrder: 100,
    optional: true,
    defaultForRoutine: false,
    defaultForReduced: false,
    requiredSkillCodes: [],
  },
  {
    code: "BACKGROUND",
    name: "Background",
    interchangeableGroup: null,
    difficultyWeight: 0,
    sortOrder: 110,
    optional: true,
    defaultForRoutine: false,
    defaultForReduced: false,
    requiredSkillCodes: [],
  },
  {
    code: "BOOKING",
    name: "Booking",
    interchangeableGroup: null,
    difficultyWeight: 0,
    sortOrder: 120,
    optional: true,
    defaultForRoutine: false,
    defaultForReduced: false,
    requiredSkillCodes: [],
  },
  {
    code: "FLOAT",
    name: "Float",
    interchangeableGroup: null,
    difficultyWeight: 0,
    sortOrder: 130,
    optional: true,
    defaultForRoutine: false,
    defaultForReduced: false,
    requiredSkillCodes: [],
  },
  {
    code: "EXTRA",
    name: "Extra",
    interchangeableGroup: null,
    difficultyWeight: 0,
    sortOrder: 140,
    optional: true,
    defaultForRoutine: false,
    defaultForReduced: false,
    requiredSkillCodes: [],
  },
];

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
    skillCodes: ["ALLERGY_SHOT"],
    ptoBalanceHours: 80,
    expectedWeeklyHours: 40,
    weeklyAssignmentLimit: 5,
    availability: weekdayWindows([1, 2, 3, 4, 5]),
  },
  {
    email: "ben.frontdesk@clinic.test",
    fullName: "Ben Front Desk",
    role: "MANAGER" as const,
    skillCodes: [],
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
    availability: weekdayWindows([1, 2, 3, 4, 5], 7 * 60 + 30, 17 * 60),
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
    skillCodes: [],
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
    },
    create: {
      id: "default",
      defaultPayrollPeriodDays: 14,
      fullTimeWeeklyHours: 40,
      paidHolidayDefaultHours: 8,
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
        active: true,
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
        active: true,
        createdByEmployeeId: demoAdminId,
        notes: "Seed: Saturday routine allergy shots can carry a second desired slot.",
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
