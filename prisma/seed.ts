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
    requiredSkillCodes: [],
  },
  {
    code: "VIRTUAL_ALLERGY",
    name: "Virtual Allergy",
    interchangeableGroup: "ALLERGY_NEW_VISIT",
    difficultyWeight: 1,
    sortOrder: 20,
    requiredSkillCodes: [],
  },
  {
    code: "NEW_GI",
    name: "New GI",
    interchangeableGroup: "GI_NEW_VISIT",
    difficultyWeight: 1,
    sortOrder: 30,
    requiredSkillCodes: [],
  },
  {
    code: "VIRTUAL_GI",
    name: "Virtual GI",
    interchangeableGroup: "GI_NEW_VISIT",
    difficultyWeight: 1,
    sortOrder: 40,
    requiredSkillCodes: [],
  },
  {
    code: "FOLLOWUP",
    name: "Followup",
    interchangeableGroup: null,
    difficultyWeight: 0,
    sortOrder: 50,
    requiredSkillCodes: [],
  },
  {
    code: "FRONT_DESK",
    name: "Front Desk",
    interchangeableGroup: null,
    difficultyWeight: 0,
    sortOrder: 60,
    requiredSkillCodes: [],
  },
  {
    code: "CIVIL_SURGEON",
    name: "Civil Surgeon",
    interchangeableGroup: null,
    difficultyWeight: 2,
    sortOrder: 70,
    requiredSkillCodes: ["CIVIL_SURGEON"],
  },
  {
    code: "ALLERGY_SHOTS",
    name: "Allergy Shots",
    interchangeableGroup: null,
    difficultyWeight: 2,
    sortOrder: 80,
    requiredSkillCodes: ["ALLERGY_SHOT"],
  },
  {
    code: "PROCEDURES",
    name: "Procedures",
    interchangeableGroup: null,
    difficultyWeight: 3,
    sortOrder: 90,
    requiredSkillCodes: ["PROCEDURE"],
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
        active: true,
      },
      create: {
        code: taskType.code,
        name: taskType.name,
        interchangeableGroup: taskType.interchangeableGroup,
        difficultyWeight: taskType.difficultyWeight,
        sortOrder: taskType.sortOrder,
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
