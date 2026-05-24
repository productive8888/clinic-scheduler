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
    code: "PROCEDURES",
    name: "Procedures",
    interchangeableGroup: null,
    difficultyWeight: 3,
    sortOrder: 90,
    optional: false,
    defaultForRoutine: true,
    defaultForReduced: false,
    requiredSkillCodes: ["PROCEDURE"],
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

const demoEmployees = [
  {
    email: "ava.allergy@clinic.test",
    fullName: "Ava Allergy",
    role: "ADMIN" as const,
    skillCodes: ["ALLERGY_SHOT"],
    ptoBalanceHours: 80,
    weeklyAssignmentLimit: 5,
  },
  {
    email: "ben.frontdesk@clinic.test",
    fullName: "Ben Front Desk",
    role: "MANAGER" as const,
    skillCodes: [],
    ptoBalanceHours: 64,
    weeklyAssignmentLimit: 5,
  },
  {
    email: "cora.civil@clinic.test",
    fullName: "Cora Civil",
    role: "EMPLOYEE" as const,
    skillCodes: ["CIVIL_SURGEON"],
    ptoBalanceHours: 72,
    weeklyAssignmentLimit: 5,
  },
  {
    email: "dev.procedure@clinic.test",
    fullName: "Dev Procedure",
    role: "EMPLOYEE" as const,
    skillCodes: ["PROCEDURE"],
    ptoBalanceHours: 56,
    weeklyAssignmentLimit: 5,
  },
  {
    email: "ella.float@clinic.test",
    fullName: "Ella Float",
    role: "EMPLOYEE" as const,
    skillCodes: ["ALLERGY_SHOT", "PROCEDURE"],
    ptoBalanceHours: 48,
    weeklyAssignmentLimit: 5,
  },
  {
    email: "finn.gi@clinic.test",
    fullName: "Finn GI",
    role: "EMPLOYEE" as const,
    skillCodes: [],
    ptoBalanceHours: 60,
    weeklyAssignmentLimit: 5,
  },
  {
    email: "gia.followup@clinic.test",
    fullName: "Gia Followup",
    role: "EMPLOYEE" as const,
    skillCodes: [],
    ptoBalanceHours: 40,
    weeklyAssignmentLimit: 5,
  },
  {
    email: "hugo.virtual@clinic.test",
    fullName: "Hugo Virtual",
    role: "EMPLOYEE" as const,
    skillCodes: [],
    ptoBalanceHours: 52,
    weeklyAssignmentLimit: 5,
  },
  {
    email: "ivy.backup@clinic.test",
    fullName: "Ivy Backup",
    role: "EMPLOYEE" as const,
    skillCodes: ["CIVIL_SURGEON", "ALLERGY_SHOT"],
    ptoBalanceHours: 44,
    weeklyAssignmentLimit: 5,
  },
];

async function main() {
  const skillByCode = new Map<string, string>();

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
  }

  for (const employee of demoEmployees) {
    const record = await prisma.employee.upsert({
      where: { email: employee.email },
      update: {
        fullName: employee.fullName,
        role: employee.role,
        status: "ACTIVE",
        ptoBalanceHours: employee.ptoBalanceHours,
        weeklyAssignmentLimit: employee.weeklyAssignmentLimit,
        startDate: new Date("2026-01-01T00:00:00.000Z"),
      },
      create: {
        email: employee.email,
        fullName: employee.fullName,
        role: employee.role,
        status: "ACTIVE",
        ptoBalanceHours: employee.ptoBalanceHours,
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
      data: [1, 2, 3, 4, 5].map((weekday) => ({
        employeeId: record.id,
        weekday,
        startMinute: 8 * 60,
        endMinute: 17 * 60,
        effectiveStartDate: new Date("2026-01-01T00:00:00.000Z"),
      })),
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
